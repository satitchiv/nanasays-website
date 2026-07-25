/**
 * retrieve.js
 * Unified retrieval for both the terminal chatbot and web API.
 * Uses vector search when embeddings exist, falls back to keyword scoring.
 */

import { embedQuery } from './embed.js';
import { projectNotionBackfill } from './nana-brain.js';

const STOP_WORDS = new Set([
  'a','an','the','is','it','in','on','at','to','for','of','and','or','but',
  'with','do','you','we','i','me','my','your','how','what','when','where',
  'who','which','does','are','was','were','be','been','have','has','had',
  'will','would','could','should','can','may','might','about','any','some',
  'this','that','there','their','they','them','tell','give','me','know',
  'get','need','want','please','like','also','then','than','its','our'
]);

function extractKeywords(question) {
  return question.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreChunk(content, keywords) {
  if (keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  return keywords.reduce((score, kw) => {
    const matches = (lower.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length;
    return score + matches;
  }, 0);
}

// ── Broad-fit detection ──────────────────────────────────────────────────────
// Questions like "will my son be happy here?" produce weak vector matches
// because the answer keywords (Foundation House, day-school routine) don't
// share words with the question. When detected, we reorder candidates so
// pastoral/community/school_life chunks make it into the final selection.
// 2026-07 widening (bug-fix): the original pattern only caught a handful of
// "will my child be happy here" words and MISSED the pastoral/safety/support
// phrasings parents actually use — "how safe is the school", "mental health
// crisis", "help kids who struggle", "settle in", "exam stress", "bullying",
// "become posh". Those retrieved fee/profile chunks instead of the relevant
// pastoral / inspection content and the answer hedged to low confidence even
// though the ISI data existed. Vocabulary below is drawn from the real failing
// question phrasings, deliberately excluding ambiguous words like bare
// "support"/"care"/"help" that also appear in fee/bursary/academic questions
// (which must stay narrow so their fee/exam chunks aren't displaced).
const BROAD_FIT_PATTERN = /\b(happy|fit|thrive|suit|suited|suitable|culture|atmosphere|environment|right\s+for|belong\w*|pastoral|safe|safety|safeguard\w*|bully|bullied|bullying|wellbeing|well-?being|welfare|mental\s+health|emotional|anxiety|anxious|stress|stressed|struggl\w*|settle|settling|settled|homesick|cope|coping|shy|introvert\w*|nurtur\w*|counsel\w*|posh|snob\w*|elitist|stuck[-\s]?up|behaviou?r|discipline|expel\w*|expuls\w*|crisis|boarding\s+house|boarding\s+life)\b/i;
// Categories worth pinning for pastoral/fit/safety questions.
// Includes both legacy names (pastoral, school_life) and the actual vocabulary
// in school_knowledge (about, boarding, support, community, inspection_report,
// policies). `inspection_report` is the ISI content parents' pastoral/safety
// questions need — without it pinned, fee/profile chunks that share stray
// keywords crowded the ISI chunk out of the top selection. Categories not
// present for a given school are simply skipped by the pinning loop.
const BROAD_FIT_PINNED_CATEGORIES = [
  'pastoral', 'community', 'school_life',
  'about', 'boarding', 'support',
  'inspection_report', 'policies',
];

function isBroadFitQuestion(question) {
  return BROAD_FIT_PATTERN.test(question || '');
}

/**
 * retrieveChunks(supabase, slug, question, opts)
 *
 * opts:
 *   maxWords          (number)  word budget for chunks; default 8000
 *   includeSensitive  (boolean) also fetch school_sensitive rows; default false
 *
 * Returns { chunks, structured, sensitive, meta } where:
 *   chunks:     top relevant rows from school_knowledge
 *   structured: row from school_structured_data (or null)
 *   sensitive:  array of school_sensitive rows (or null when not requested)
 *   meta:       { embedMs, retrievalMs, candidatesFound, sourcePathTaken,
 *                 isBroadFit, totalWords }
 */
export async function retrieveChunks(supabase, slug, question, opts = {}) {
  const startTime       = Date.now();
  const maxWords        = opts.maxWords || 8000;
  // Default true: school_sensitive is a small finite table (max 4 rows × ~380
  // chars per school). Always including it removes the brittle keyword-regex
  // gate we used to have around it. Callers can opt out explicitly with
  // { includeSensitive: false } — useful for chunk-only test rigs.
  const includeSensitive = opts.includeSensitive !== false;
  const isBroadFit      = isBroadFitQuestion(question);

  let embedMs    = 0;
  let pathTaken  = 'none';
  const warnings = [];

  // Always fetch the NanaSays profile row first (pinned baseline).
  // D7-3 (2026-05-08): handle BOTH legacy `nanasays` and new
  // `nanasays_internal` source_types — internal-profile rows are written
  // by crawl-school-site.js and need to be pinned even after the rename.
  const { data: profileRows, error: profileErr } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .in('source_type', ['nanasays', 'nanasays_internal'])
    .limit(1);
  const profileRow = (profileRows && profileRows[0]) || null;
  if (profileErr) warnings.push(`profile fetch: ${profileErr.message}`);
  // 2026-07 bug-fix: the pinned NanaSays profile chunk embeds fee lines
  // derived from schools.fees_usd_* ("Annual fees: USD 79,058 – 79,058" /
  // "Boarding fees (USD): 79058"). For UK schools that is a USD conversion the
  // model was quoting to parents as if it were the local (GBP) price and then
  // calling the school "over budget". Strip those USD-denominated fee lines
  // from the pinned profile — the authoritative fee line now comes from
  // buildStructuredBlock's fallback (SSD local currency → schools.fees_original
  // → explicitly-labelled USD). Non-USD profile fee lines are left untouched.
  if (profileRow && typeof profileRow.content === 'string') {
    profileRow.content = stripProfileUsdFees(profileRow.content);
  }

  // Check if embeddings exist for this school
  const { count: embCount, error: embCountErr } = await supabase
    .from('school_knowledge')
    .select('*', { count: 'exact', head: true })
    .eq('school_slug', slug)
    .not('embedding', 'is', null);
  if (embCountErr) warnings.push(`embedding count: ${embCountErr.message}`);

  let candidates = [];
  // For broad-fit questions, fetch more candidates so we have material to
  // reorder for category coverage below.
  // 2026-06-11 (whole-landscape slice): narrow-question candidate pool
  // widened 8 → 16. With the chunk-selection cap at 10 (below) and the
  // max-2-per-source dedup rule, 8 candidates routinely couldn't even fill
  // the selection — an answer sitting in vector rank 9-16 was unreachable.
  const matchCount = isBroadFit ? 24 : 16;

  // Helper: run keyword fallback and mark the path
  const runKeywordFallback = async (reason) => {
    if (reason) warnings.push(reason);
    candidates = await keywordFallback(supabase, slug, question);
    pathTaken  = 'keyword';
  };

  if (embCount && embCount > 0) {
    // ── Vector search path ───────────────────────────────────────────────────
    let vectorOk = false;
    try {
      const embedStart = Date.now();
      const queryEmbedding = await embedQuery(question);
      embedMs = Date.now() - embedStart;

      const { data: vectorResults, error: rpcErr } = await supabase.rpc('match_school_knowledge', {
        query_embedding: queryEmbedding,
        p_school_slug:   slug,
        match_count:     matchCount,
      });

      // Codex P1: Supabase often returns errors via { error } without throwing.
      // Without this branch, RPC failures silently produced candidates=[] and
      // pathTaken='vector', looking like "valid" empty results.
      if (rpcErr) {
        await runKeywordFallback(`vector RPC error: ${rpcErr.message}`);
      } else if (!vectorResults || vectorResults.length === 0) {
        await runKeywordFallback('vector RPC returned no rows; falling back to keyword');
      } else {
        // D7-3 (2026-05-08): defence-in-depth — drop both internal source
        // types + internal:// URLs in case the RPC/index hasn't been updated.
        candidates = vectorResults.filter(r =>
          r.source_type !== 'nanasays' &&
          r.source_type !== 'nanasays_internal' &&
          !(typeof r.source_url === 'string' && r.source_url.startsWith('internal://'))
        );
        pathTaken  = 'vector';
        vectorOk   = true;
      }
    } catch (e) {
      await runKeywordFallback(`vector path threw: ${e.message}`);
    }
    if (!vectorOk && pathTaken === 'none') {
      // Defensive: should never happen since runKeywordFallback sets pathTaken
      pathTaken = 'keyword';
    }
  } else {
    // ── Keyword fallback path ────────────────────────────────────────────────
    await runKeywordFallback(embCount === 0 ? 'no embeddings for school; using keyword search' : null);
  }

  // ── Broad-fit category pinning ──────────────────────────────────────────────
  // Reorder candidates so the first chunk in each pinned category (pastoral,
  // community, school_life) sits at the top of the list — guaranteeing the
  // selection loop below picks them up before fees/admissions chunks that may
  // share keywords with the question by accident.
  if (isBroadFit && candidates.length > 0) {
    const pinnedFound = [];
    const others      = [];
    const seenPinned  = new Set();
    for (const c of candidates) {
      if (BROAD_FIT_PINNED_CATEGORIES.includes(c.category) && !seenPinned.has(c.category)) {
        pinnedFound.push(c);
        seenPinned.add(c.category);
      } else {
        others.push(c);
      }
    }
    candidates = [...pinnedFound, ...others];
  }

  // Fetch structured data + Notion sidecar (hand-curated UK school facts) in
  // parallel. Notion sidecar (school_notion_backfill, Phase 1 landed 2026-05-18)
  // adds pupil counts, class size, boarding ratio, lowest-entry year, distance
  // to Heathrow — fields SSD does not currently cover for most schools. Only
  // clean rows are surfaced; flagged/partial/never-synced rows are dropped at
  // the fetch boundary. Service-role only selects (school_slug, status, parsed)
  // — no `raw_properties`, `rejected`, `flagged_review` — per Codex r1 RLS
  // guidance (those columns can leak unverified Notion data).
  const [
    { data: structured, error: structErr },
    { data: schoolRow, error: schoolErr },
    { data: notionRow, error: notionErr },
  ] = await Promise.all([
    supabase
      .from('school_structured_data')
      .select('*')
      .eq('school_slug', slug)
      .maybeSingle(),
    // schools row: local-currency fee text + USD fallback + ISI summary. Used
    // for the fee fallback (bug 1) and the pastoral-question ISI safety-net
    // (bug 2). Kept to the minimal column set needed downstream.
    supabase
      .from('schools')
      .select('fees_original, fees_usd_min, fees_usd_max, fees_currency, isi_summary, isi_report_date')
      .eq('slug', slug)
      .maybeSingle(),
    supabase
      .from('school_notion_backfill')
      .select('school_slug, status, parsed')
      .eq('school_slug', slug)
      // Codex r3 P1: accept both `clean` (post-Phase 1.5 promotion) and
      // `matched` (pure-write rows from the original sync) — both are
      // safe-to-surface. Live data 2026-05-24: 72 clean, 0 matched, 3
      // partial_with_review. Excluding `matched` would silently drop legit
      // sidecar rows if a future sync run adds new schools.
      // `partial_with_review` is intentionally excluded — those rows carry
      // flagged_review cells needing manual reconciliation.
      .in('status', ['clean', 'matched'])
      .maybeSingle(),
  ]);
  if (structErr) warnings.push(`structured fetch: ${structErr.message}`);
  if (schoolErr) warnings.push(`schools fetch: ${schoolErr.message}`);
  if (notionErr) warnings.push(`notion fetch: ${notionErr.message}`);
  // Project at the fetch boundary so the raw `parsed` blob (which contains
  // boarding_fee_term / boarding_fee_year and raw Notion property shapes)
  // never reaches downstream surfaces — including the streaming `final`
  // payload that ships `retrieval` wholesale (Codex r1 P1.1).
  const notion_backfill = projectNotionBackfill(
    notionRow && notionRow.parsed ? notionRow.parsed : null,
    structured || null,
  );

  // Sensitive (regulatory/inspection) data — included by default. Small finite
  // table; including everything we have is cheaper than predicting when it's
  // relevant. The schema validator's citation whitelist still enforces that
  // Claude only cites sources actually present in the retrieval payload, so
  // always-include doesn't dilute citation discipline.
  // `details` column is omitted: empty across all production rows today. Add
  // back here if it starts being populated.
  let sensitive = null;
  if (includeSensitive) {
    const { data: sensitiveRows, error: sensErr } = await supabase
      .from('school_sensitive')
      .select('source, data_type, source_url, date, severity, title, summary')
      .eq('school_slug', slug);
    if (sensErr) warnings.push(`sensitive fetch: ${sensErr.message}`);
    sensitive = sensitiveRows || [];
  }

  // Build final chunk list: profile first, then candidates up to word budget
  const selected    = [];
  const sourceCounts = {};
  let totalWords    = 0;

  if (profileRow) {
    const w = profileRow.word_count || countWords(profileRow.content);
    selected.push(profileRow);
    sourceCounts[profileRow.source_url] = 1;
    totalWords += w;
  }

  for (const row of candidates) {
    // 2026-06-11 (whole-landscape slice): selection cap raised 6 → 10. The
    // word budget (maxWords, default 8000) remains the real ceiling; the
    // count cap is just a guard against many tiny chunks crowding the prompt.
    if (selected.length >= 10) break;
    // D7-3 (2026-05-08): handle both legacy `nanasays` and new
    // `nanasays_internal` source_types — both are our own profile data,
    // never cite as external. Also reject any explicit `internal://` URL
    // sentinel (defence-in-depth).
    if (row.source_type === 'nanasays' || row.source_type === 'nanasays_internal') continue;
    if (typeof row.source_url === 'string' && row.source_url.startsWith('internal://')) continue;

    const sourceCount = sourceCounts[row.source_url] || 0;
    if (sourceCount >= 2) continue;

    const rowWords  = row.word_count || countWords(row.content);
    const remaining = maxWords - totalWords;
    if (remaining < 100) break;

    let content   = row.content;
    let usedWords = rowWords;

    if (rowWords > remaining) {
      content   = row.content.split(/\s+/).slice(0, remaining).join(' ') + '… [truncated]';
      usedWords = remaining;
    }

    selected.push({ ...row, content });
    sourceCounts[row.source_url] = sourceCount + 1;
    totalWords += usedWords;
  }

  // Fee-fallback inputs for buildStructuredBlock (bug 1). Local-currency SSD
  // fees still win inside buildStructuredBlock; this carries the school's
  // published fee text + USD fallback for schools whose SSD fees are null.
  const schoolMeta = schoolRow
    ? {
        fees_original: typeof schoolRow.fees_original === 'string' ? schoolRow.fees_original : null,
        fees_usd_min:  schoolRow.fees_usd_min ?? null,
        fees_usd_max:  schoolRow.fees_usd_max ?? null,
        fees_currency: schoolRow.fees_currency ?? null,
      }
    : null;

  // ISI safety-net (bug 2): when a pastoral/safety/fit question does NOT
  // surface an inspection_report chunk for a school that HAS a populated
  // isi_summary (e.g. Oakham — real ISI report parsed into the column but no
  // inspection_report chunk in school_knowledge), inject the summary directly
  // so the model answers from real regulatory data instead of hedging. Gated
  // on isBroadFit so ordinary fee/academic questions never pull it in.
  const hasIsiChunk = selected.some((c) => c && c.category === 'inspection_report');
  let isi_fallback = null;
  if (
    isBroadFit &&
    !hasIsiChunk &&
    schoolRow &&
    typeof schoolRow.isi_summary === 'string' &&
    schoolRow.isi_summary.trim()
  ) {
    isi_fallback = {
      summary:     schoolRow.isi_summary.trim(),
      report_date: schoolRow.isi_report_date || null,
    };
  }

  return {
    chunks:     selected,
    structured: structured || null,
    schoolMeta,
    isi_fallback,
    notion_backfill,
    sensitive,
    meta: {
      embedMs,
      retrievalMs:      Date.now() - startTime,
      candidatesFound:  candidates.length,
      sourcePathTaken:  pathTaken,
      isBroadFit,
      totalWords,
      warnings,
    },
  };
}

// ── Keyword fallback (loads all rows for this school) ─────────────────────────
async function keywordFallback(supabase, slug, question) {
  // D7-3 (2026-05-08): exclude both internal source types.
  const { data: rows } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .not('source_type', 'in', '("nanasays","nanasays_internal")');

  if (!rows || rows.length === 0) return [];

  const keywords = extractKeywords(question);
  return rows
    .map(row => ({ ...row, score: scoreChunk(row.content, keywords) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * retrieveChunksGlobal(supabase, question, opts)
 *
 * Vector search across ALL schools — no slug filter.
 * Returns the top chunks from whichever schools are most semantically
 * relevant to the question, with school_slug attribution on each chunk.
 *
 * opts:
 *   maxChunks  (number)  max chunks to return; default 25
 *   maxWords   (number)  word budget across all chunks; default 10000
 */
export async function retrieveChunksGlobal(supabase, question, opts = {}) {
  const startTime = Date.now();
  const maxChunks = opts.maxChunks || 25;
  const maxWords  = opts.maxWords  || 10000;

  let embedMs   = 0;
  let pathTaken = 'none';

  // Vector search
  let candidates = [];
  try {
    const embedStart = Date.now();
    const queryEmbedding = await embedQuery(question);
    embedMs = Date.now() - embedStart;

    const { data: vectorResults, error: rpcErr } = await supabase.rpc(
      'match_school_knowledge_global',
      { query_embedding: queryEmbedding, match_count: maxChunks }
    );

    if (rpcErr || !vectorResults?.length) {
      // Keyword fallback across all UK schools. Pull UK-evidence slug list first
      // and filter — without this, fallback leaks Bangkok / Switzerland / etc.
      // (matches the UK filter the RPC enforces; same scope rule).
      const ukSlugs = new Set();
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const { data: ukPage, error: ukErr } = await supabase
          .from('schools_status')
          .select('school_slug')
          .eq('is_uk_evidence', true)
          .range(offset, offset + PAGE - 1);
        if (ukErr || !ukPage?.length) break;
        for (const r of ukPage) ukSlugs.add(r.school_slug);
        if (ukPage.length < PAGE) break;
      }

      // D7-3 (2026-05-08): exclude BOTH legacy `nanasays` and new
      // `nanasays_internal` source types from the global candidate pool.
      // Also reject any explicit internal:// URL sentinel as belt-and-braces.
      const { data: rows } = await supabase
        .from('school_knowledge')
        .select('id, school_slug, source_url, source_type, category, title, content, word_count')
        .not('source_type', 'in', '("nanasays","nanasays_internal")')
        .limit(500);
      const keywords = extractKeywords(question);
      candidates = (rows || [])
        .filter(r => ukSlugs.size === 0 || ukSlugs.has(r.school_slug))  // open if UK list empty
        .filter(r => !(typeof r.source_url === 'string' && r.source_url.startsWith('internal://')))
        .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks);
      pathTaken = 'keyword';
    } else {
      // D7-3 (2026-05-08): defence-in-depth — even though the global RPC
      // now filters internal source types, still post-filter here in case
      // the migration hasn't been applied yet on this DB.
      candidates = (vectorResults || []).filter(r =>
        r.source_type !== 'nanasays' &&
        r.source_type !== 'nanasays_internal' &&
        !(typeof r.source_url === 'string' && r.source_url.startsWith('internal://'))
      );
      pathTaken  = 'vector';
    }
  } catch (e) {
    pathTaken = 'error';
  }

  // Apply word budget
  const selected  = [];
  let totalWords  = 0;
  for (const row of candidates) {
    const rowWords  = row.word_count || countWords(row.content);
    if (totalWords + rowWords > maxWords && selected.length > 0) break;
    selected.push(row);
    totalWords += rowWords;
  }

  return {
    chunks: selected,
    structured: null,
    notion_backfill: null,
    sensitive:  [],
    meta: {
      embedMs,
      retrievalMs:     Date.now() - startTime,
      candidatesFound: candidates.length,
      sourcePathTaken: pathTaken,
      isBroadFit:      false,
      totalWords,
      warnings:        [],
    },
  };
}

function countWords(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

// Remove USD-denominated fee lines from the pinned NanaSays profile chunk so a
// USD-converted figure is never surfaced to the model as the local price.
// Matches the profile generator's exact line shapes:
//   "Annual fees: USD 79,058 – 79,058"
//   "Boarding fees (USD): 79058"
// Lines that state fees in the school's real local currency (e.g.
// "Annual fees: GBP ...") are intentionally left in place.
function stripProfileUsdFees(content) {
  if (typeof content !== 'string') return content;
  return content
    .replace(/^[ \t]*Annual fees:[ \t]*USD\b.*$/gim, '')
    .replace(/^[ \t]*Boarding fees \(USD\):.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
}
