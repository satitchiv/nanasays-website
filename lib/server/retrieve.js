/**
 * retrieve.js
 * Unified retrieval for both the terminal chatbot and web API.
 * Uses vector search when embeddings exist, falls back to keyword scoring.
 */

import { embedQuery } from './embed.js';

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
const BROAD_FIT_PATTERN = /\b(happy|fit|thrive|suit|culture|atmosphere|right\s+for|pastoral)\b/i;
// Categories worth pinning for "will my child be happy here" questions.
// Includes both legacy names (pastoral, school_life) and the actual vocabulary
// in school_knowledge (about, boarding, support, community). Categories not
// present for a given school are simply skipped by the pinning loop.
const BROAD_FIT_PINNED_CATEGORIES = [
  'pastoral', 'community', 'school_life',
  'about', 'boarding', 'support',
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

  // Always fetch the NanaSays profile row first (pinned baseline)
  const { data: profileRow, error: profileErr } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .eq('source_type', 'nanasays')
    .maybeSingle();
  if (profileErr) warnings.push(`profile fetch: ${profileErr.message}`);

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
  const matchCount = isBroadFit ? 20 : 8;

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
        candidates = vectorResults.filter(r => r.source_type !== 'nanasays');
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

  // Fetch structured data
  const { data: structured, error: structErr } = await supabase
    .from('school_structured_data')
    .select('*')
    .eq('school_slug', slug)
    .maybeSingle();
  if (structErr) warnings.push(`structured fetch: ${structErr.message}`);

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
    if (selected.length >= 6) break;
    if (row.source_type === 'nanasays') continue;

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

  return {
    chunks:     selected,
    structured: structured || null,
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
  const { data: rows } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .neq('source_type', 'nanasays');

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

      const { data: rows } = await supabase
        .from('school_knowledge')
        .select('id, school_slug, source_url, source_type, category, title, content, word_count')
        .neq('source_type', 'nanasays')
        .limit(500);
      const keywords = extractKeywords(question);
      candidates = (rows || [])
        .filter(r => ukSlugs.size === 0 || ukSlugs.has(r.school_slug))  // open if UK list empty
        .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks);
      pathTaken = 'keyword';
    } else {
      candidates = vectorResults;
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
