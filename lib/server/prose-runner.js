/**
 * prose-runner.js
 *
 * Executes a deterministic IntentMatch from intent-router.js:
 *   1. Run all tools in the plan (parallel where allowed)
 *   2. Build a compact user-message with the tool results
 *   3. Call callClaudeStream with the prose system prompt
 *   4. Stream tokens natively to the consumer
 *   5. Parse the trailing <!-- nana-meta {...} --> comment, strip it from the
 *      visible markdown, and emit a `final` event matching the existing event
 *      shape from runOneQuestionStream / runAgenticQuestionStream
 *
 * Used by runIntentProseStream in nana-brain.js. Not called directly by the
 * route — the brain wrapper exists so prose-runner stays decoupled from
 * Claude transport details.
 *
 * Event shape:
 *   { type: 'answer_format', format: 'prose' }
 *   { type: 'tool_call', name, args, status: 'started' | 'completed', result_summary? }
 *   { type: 'token', text }
 *   { type: 'retrieval', payload }                  (compatibility — citations)
 *   { type: 'final', payload }
 *   { type: 'error', error, code }
 */

import { TOOLS } from './tools.js';
import { injectToolResult } from './tool-result-compact.js';
import { computeCostUSD } from './nana-brain.js';

// Compact prose system prompt. Targets ~2K chars vs the structured chat
// schema's ~17K. Smaller prompt = faster TTFT.
export const PROSE_SYSTEM_PROMPT = `You are Nana, a concise UK independent-schools adviser for parents.

Answer in plain markdown prose using ONLY the tool results provided. Never
invent figures, alumni, fixtures, fees or rankings. If the evidence is thin
or contradictory, say so plainly in one short sentence.

Style:
- Lead with the strongest concrete fact, name the school.
- Keep paragraphs short. Use bullets for top-N lists (numbered when ranked).
- Cite source URLs inline as markdown links: ([source](URL)). HARD RULES
  for citations:
  · A URL MUST start with "https://" or "http://" — anything else is not
    a URL.
  · School slugs like "reeds-school-uk" or "wellington-college" are NOT
    URLs. They appear in [brackets] in tool results as identifiers, not
    citation targets. Never use them as citation URLs.
  · Only use URL strings that appear verbatim in the tool results.
  · If you can't find a real https:// URL for a fact, state the fact
    without a citation. Never fabricate, never write
    "[source](slug-name)" or "[source](https://slug-like-thing)".
- Mention real tradeoffs honestly. If a parent asked a comparative question,
  give a clear judgement, not a list of "both are great."
- No headings, no JSON, no code fences, no schema language ("confidence",
  "watch out", "what we don't know"). Write like a human adviser.

Voice — sound like a trusted advisor, not a generic AI assistant:
- Specifics, never platitudes. "94% A*-A at A-level (2024)" not "strong
  academics". If you can't name a fact, that's a data gap, not a sentence.
- No throat-clearing: skip "I'd be happy to help", "Great question",
  "As an AI assistant", "Let me explain", "It's important to note".
- On uncertainty, name the gap + redirect: "[X] isn't in my dataset,
  but [Y] does show [fact]." Never just "I don't have that information."
- Hedge with reasons: "Pastoral ratings are strong because every house
  has a wellbeing officer" — not "it's worth noting that…".
- British understatement. No "amazing", "incredible", "wonderful",
  "outstanding" (unless quoting an ISI/Ofsted grade like "ISI Outstanding").
  UK indie school parents read effusive language as marketing voice.
- Name the fit when data supports it ("suits ambitious self-directed
  kids who thrive on competition") not just qualities. HARD GUARDRAIL:
  make a fit claim only when you can name the specific data point
  supporting it in the same sentence. Personality claims need pastoral
  or culture data, not just exam scores.

End your answer with EXACTLY ONE hidden metadata line on its own line:
<!-- nana-meta {"schools_mentioned":["slug-1","slug-2"],"citations":["https://..."]} -->

Use slugs and URLs that appeared in the tool results. Output nothing after
the comment line.`;

// Slice 5-FU1 round 6 — Codex prescribed two-pass extraction. Pass 1
// (PROSE_SYSTEM_PROMPT above) is now PROSE-ONLY: voice rules + meta
// tail with schools_mentioned + citations. Asking the same call to
// also emit proposed_actions failed across 5 prompt rounds — the model
// reliably dropped the secondary structured task in favour of the
// primary prose task. Pass 2 (this prompt below) runs a separate
// focused LLM call after prose finishes; its only job is to convert
// the question + Nana's answer + shortlist into a proposed_actions
// JSON object (or {}). No competing voice rules, no prose to write.
export const EXTRACTOR_SYSTEM_PROMPT = `You convert a school-comparison answer into a structured "+ Add as row" proposal for a parent's comparison table.

You are NOT writing prose. Output JSON only — no markdown fences, no commentary, no explanation. Stop after the closing brace.

Two valid outputs:

A. {"proposed_actions": {"<proposal_id>": {"kind": "propose_add_row", "row_name": "...", "group_name": "...", "weight": 1, "cell_data": {"<slug>": {"value": "...", "source": "https://..."}, "<slug>": {"value": "..."}}}}}

B. {}    (when no clean comparison exists)

Output A only when ALL hold:
1. The ANSWER below compares 2+ schools on a clear, durable, comparable dimension (Saturday school, House system, CCF, bursary support, scholarship deadline, religious affiliation, Saturday lessons, etc).
2. The dimension is NOT in the SEEDED ROWS list below. If it duplicates a seeded row, output {}.
3. The ANSWER states a concrete value for ≥ 2 schools in the SHORTLIST.

Field rules (the validator enforces these — bad rows are dropped):
- proposal_id: ^[a-z0-9_-]{1,40}$  (use a snake_case slug derived from the row_name).
- kind: ALWAYS "propose_add_row".
- row_name: 1..80 chars, plain English title. No emoji.
- group_name: 1..40 chars. Use one of: About, Pastoral, Academics, Fees, Admissions, Media, Co-curricular, Sport. (Other short labels OK if a better fit.)
- weight: omit (defaults to 1).
- cell_data: REQUIRED, non-empty object. Keys = slugs from SHORTLIST only — never invent.
  · "value": short string ≤ 80 chars, OR null. Distil the answer into a compact LABEL per school. NOT a sentence.
  · "source": optional. MUST be an https:// URL that appeared in the answer's citations or tool results.
  · "note": optional, ≤ 80 chars.
- Need ≥ 2 cells with real (non-null, non-empty) values, otherwise output {}.
- At most 1 proposal per call.

SEEDED ROWS — do NOT duplicate any of these (they are auto-added):
School type, Location, Travel from Heathrow, Class size, Total pupils, Lowest boarding entry, Boarding pupils, International pupils, Day pupils, Boarding ratio, GCSE 9-7, A-level A*-A, Boarding fee per term, Boarding fee per year, Registration fee, Year 9 / 10 admissions, School view.

EXAMPLE — given this prose answer:

"Wellington College has the stronger CCF evidence: the site lists CCF as a core co-curricular pillar from Year 9, with weekly drill, Army and RAF sections, and an annual field day ([source](https://www.wellingtoncollege.org.uk/co-curricular/ccf)). Sherborne School also runs a CCF, but the public material describes it as voluntary from Year 10 onwards, with smaller Army-only enrolment ([source](https://www.sherborne.org/our-school/co-curricular))."

You output (one line, no wrapping):
{"proposed_actions":{"ccf_programme":{"kind":"propose_add_row","row_name":"CCF programme","group_name":"Co-curricular","weight":1,"cell_data":{"wellington-college":{"value":"Compulsory from Y9; Army & RAF; weekly + field day","source":"https://www.wellingtoncollege.org.uk/co-curricular/ccf"},"sherborne-school":{"value":"Voluntary from Y10; Army-only; smaller enrolment","source":"https://www.sherborne.org/our-school/co-curricular"}}}}}

Notice the value strings are LABELS plucked from the prose, not full sentences. The proposal_id (ccf_programme) is the row_name slugged.

Output ONLY the JSON object. Stop after the closing brace.`;

// ── Helpers ──────────────────────────────────────────────────────────────
// compactToolResult moved to scripts/lib/tool-result-compact.js so the agentic
// loop can share the same projection. The new shared compactor also recurses
// one level into nested objects so sports_profile renders all 5 sports
// instead of chopping after tennis.

// Slug shape Nana is allowed to see in the prompt. Codex round-1 BLOCK #2:
// shortlistSlugs from the route body are typeof-string-only filtered, which
// is not enough — a string can carry arbitrary content. Reject anything
// that isn't a plain a-z/0-9/dash slug before injecting into the prompt.
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

function sanitizeShortlistSlugs(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const s of input) {
    if (typeof s !== 'string') continue;
    const lo = s.trim().toLowerCase();
    if (!SLUG_RE.test(lo)) continue;
    if (seen.has(lo)) continue;
    seen.add(lo);
    out.push(lo);
    if (out.length >= 10) break;
  }
  return out;
}

function buildUserMessage(question, intentMatch, toolBlobs, parentContext, historyContext) {
  const ctxLines = [];
  if (parentContext)  ctxLines.push(parentContext);
  if (historyContext) ctxLines.push(historyContext);

  const toolBlock = toolBlobs.length
    ? toolBlobs.map(t =>
        `═══ TOOL [${t.name}] (${t.summary || ''}) ═══\n${t.compact}`
      ).join('\n\n')
    : '(no tool results)';

  // Slice 5-FU1 round 6: shortlist no longer injected into pass-1 user
  // message — the proposed_actions task moved to a dedicated pass-2
  // extractor (see EXTRACTOR_SYSTEM_PROMPT + extractProposedActionsTwoPass).
  return [
    ctxLines.length ? ctxLines.join('\n') + '\n' : '',
    `PARENT QUESTION: ${question}\n`,
    `Intent classified as: ${intentMatch.intent}.`,
    `\n${toolBlock}\n`,
    `Write the answer in markdown prose using the data above. Do not invent.`,
    `End with the <!-- nana-meta {...} --> line.`,
  ].join('\n');
}

// ── Slice 5-FU1 r6 — pass-2 extractor ────────────────────────────────────
// Codex r6: r5's prompt-only approach failed on 5 successive rounds. The
// model reliably emits the prose answer + simple meta tail but drops
// proposed_actions. Splitting the work into two LLM calls — prose
// (pass 1, unchanged) + extractor (pass 2, this section) — solves it
// because pass 2 has no competing voice rules to deprioritise the
// structured task.

function buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback }) {
  const lines = [
    `QUESTION: ${question}`,
    '',
    "ANSWER (Nana's prose):",
    prose,
    '',
    'SHORTLIST (you may ONLY use these slugs as cell_data keys):',
    ...shortlistSlugs.map(s => `  - ${s}`),
  ];
  if (Array.isArray(citations) && citations.length > 0) {
    lines.push('', 'CITATIONS available in the answer:');
    for (const url of citations.slice(0, 8)) lines.push(`  - ${url}`);
  }
  if (feedback) {
    lines.push('', 'FEEDBACK on your previous attempt (correct it or output {}):', feedback);
  }
  lines.push('', 'Output the JSON now.');
  return lines.join('\n');
}

// JSON.parse with two recovery paths: strip ```json fences, then fall
// back to extracting the largest balanced {…} block. Models occasionally
// wrap output in fences or add a stray prefix even when told not to;
// returning null is fine — we silently skip the proposal in that case.
function safeJsonParse(text) {
  if (typeof text !== 'string') return null;
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try { return JSON.parse(stripped); } catch (_) { /* fall through */ }
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

async function callExtractorOnce(callClaude, signal, ctx, systemPrompt, userMessage) {
  let raw = '';
  for await (const chunk of callClaude(systemPrompt, null, userMessage, '', ctx, signal)) {
    raw += chunk;
    // Pass 2 is hidden from the UI — do not yield tokens. We just
    // collect the full string and hand it to JSON.parse.
  }
  return raw;
}

// Slice 5-FU1 r6 cost-tracking follow-up: sum two usage objects so the
// total cost reported in nana_chat_logs reflects BOTH passes (prose +
// extractor). Without this the dashboard underreports two-pass cost
// by ~50%. Accepts either object as null/undefined.
function mergeUsage(a, b) {
  if (!a && !b) return null;
  const safe = (u) => u || {};
  const A = safe(a); const B = safe(b);
  return {
    input_tokens:                (A.input_tokens ?? 0)                + (B.input_tokens ?? 0),
    output_tokens:               (A.output_tokens ?? 0)               + (B.output_tokens ?? 0),
    cache_creation_input_tokens: (A.cache_creation_input_tokens ?? 0) + (B.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:     (A.cache_read_input_tokens ?? 0)     + (B.cache_read_input_tokens ?? 0),
  };
}

/**
 * Two-pass proposed_actions extraction with validator-backed retry.
 *
 * Skips entirely when the shortlist has fewer than 2 valid slugs (the
 * validator would drop any proposal anyway, so we save the LLM call).
 * Skips on empty / very short prose answers (nothing to mine).
 *
 * Returns the same shape as validateProposedActions:
 *   { actions: ProposedActions | null, dropped: { byReason, totalSeen, kept } }
 *
 * Telemetry reasons (for the [prose] log line):
 *   extractor_skipped_short_shortlist  — < 2 slugs
 *   extractor_skipped_short_prose      — answer too short / empty
 *   extractor_chose_empty              — model returned {} (correct skip)
 *   extractor_parse_failure            — JSON.parse failed both attempts
 *   extractor_call_failure             — callClaude threw
 *   plus all reasons from validateProposedActions.
 */
// Gate Pass 2 on comparison-shaped intents only. Single-school intents
// (tell_me_about_school, fact_lookup, safeguarding_or_pastoral,
// single-school fees_value) should never produce a "+ Add as row"
// proposal because there's no comparison to make. Empirical false
// positive caught during dev test 2026-05-08: "Tell me about Clifton
// College" produced a pill via inferred multi-school cell_data. This
// gate also saves the Pass 2 LLM call (~$0.001-0.003) for those routes.
const COMPARISON_INTENTS = new Set([
  'compare_two_on_dim',
  'shortlist_rank_or_compare',
  'top_n_for_dim',
]);

async function extractProposedActionsTwoPass({
  callClaude, signal, question, prose, shortlistSlugs, citations, intent,
}) {
  // Cost-tracking follow-up: every code path that returns from this
  // function carries a `usage` object summing the extractor's own
  // token usage (1 attempt or 2). Callers merge this with pass-1 usage
  // before logging to nana_chat_logs.
  const empty = (reason, usage = null) => ({
    actions: null,
    dropped: { byReason: reason ? { [reason]: 1 } : {}, totalSeen: 0, kept: 0 },
    usage,
  });

  if (!intent || !COMPARISON_INTENTS.has(intent))                  return empty('extractor_skipped_non_comparison_intent');
  if (!Array.isArray(shortlistSlugs) || shortlistSlugs.length < 2) return empty('extractor_skipped_short_shortlist');
  if (typeof prose !== 'string' || prose.trim().length < 50)       return empty('extractor_skipped_short_prose');

  // Attempt 1
  const ctx1 = {};
  let raw1;
  try {
    raw1 = await callExtractorOnce(
      callClaude, signal, ctx1,
      EXTRACTOR_SYSTEM_PROMPT,
      buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback: null }),
    );
  } catch (_) {
    return empty('extractor_call_failure', ctx1.usage || null);
  }
  if (signal?.aborted) return empty(null, ctx1.usage || null);

  const parsed1 = safeJsonParse(raw1);
  // Empty {} = model explicitly chose no proposal. Honour it.
  if (parsed1 && typeof parsed1 === 'object' && !Array.isArray(parsed1) && Object.keys(parsed1).length === 0) {
    return empty('extractor_chose_empty', ctx1.usage || null);
  }

  const result1 = validateProposedActions(parsed1, shortlistSlugs);
  if (result1.actions) return { ...result1, usage: ctx1.usage || null };

  // Attempt 2 — feed back the validation reasons. ONE retry only.
  const reasons = Object.entries(result1.dropped.byReason).map(([k, v]) => `${k}=${v}`).join(', ');
  const feedback = parsed1 == null
    ? 'Your previous output failed JSON parsing. Output ONLY a JSON object — no markdown fences, no commentary.'
    : `Validator rejected your previous output. Reasons: ${reasons || 'unknown'}. Either output corrected JSON matching the schema, or output {} if no clean comparison exists.`;

  const ctx2 = {};
  let raw2;
  try {
    raw2 = await callExtractorOnce(
      callClaude, signal, ctx2,
      EXTRACTOR_SYSTEM_PROMPT,
      buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback }),
    );
  } catch (_) {
    return { ...result1, usage: mergeUsage(ctx1.usage, ctx2.usage) };
  }
  if (signal?.aborted) return empty(null, mergeUsage(ctx1.usage, ctx2.usage));

  const parsed2 = safeJsonParse(raw2);
  const usageBoth = mergeUsage(ctx1.usage, ctx2.usage);
  if (parsed2 == null) {
    return {
      actions: null,
      dropped: {
        byReason: { ...result1.dropped.byReason, extractor_parse_failure: 1 },
        totalSeen: result1.dropped.totalSeen,
        kept: 0,
      },
      usage: usageBoth,
    };
  }
  if (typeof parsed2 === 'object' && !Array.isArray(parsed2) && Object.keys(parsed2).length === 0) {
    return empty('extractor_chose_empty', usageBoth);
  }
  const result2 = validateProposedActions(parsed2, shortlistSlugs);
  return result2.actions
    ? { ...result2, usage: usageBoth }
    : { ...result1,  usage: usageBoth };
}

// Slice 5-FU1 — proposed_actions validation.
//
// The RPC `confirm_add_row` is the trust boundary; this function is UX
// hardening, not security. It mirrors the RPC's bounds (kind, row_name
// 1..80, group_name 1..40, weight 0..5, cell_data non-empty object) AND
// adds three FU1-specific rules the RPC doesn't enforce:
//   • slug allowlist = the sanitized shortlistSlugs (Nana can only
//     propose rows for schools the parent is actively comparing).
//   • drop seeded-row names so we don't burn a bubble pill on a
//     proposal the route's cross-lens collision check would 409.
//   • require ≥ 2 cells with real (non-null, non-empty) values so
//     {value:null} × 2 doesn't pass through as an empty row.
// Bad entries are dropped silently. The visible answer still renders.
//
// Returns { actions, dropped: { byReason: {...}, totalSeen, kept } } so
// the caller can log a single line per response without leaking values.
const PROPOSAL_ID_RE    = /^[a-zA-Z0-9_-]{1,40}$/;
// Codex round-2 nit: only https:// citations should pass through. The
// citations[] list elsewhere in the prompt insists on https:// and the
// bubble UI renders these as user-clickable links.
const HTTPS_URL_RE      = /^https:\/\//i;
const HARD_PROPOSAL_CAP = 2;

// Names auto-seeded by the General lens (see lib/research-room/seed-rows.ts
// GENERAL_SPECS). Keep in sync if the seeder grows. Comparison is done
// against a normalized form to absorb hyphen / em-dash / spacing drift —
// e.g. "GCSE 9-7" should still match the seeded "GCSE 9–7".
const SEEDED_ROW_NAMES_NORMALIZED = new Set([
  'school type', 'location', 'travel from heathrow', 'class size',
  'total pupils', 'lowest boarding entry', 'boarding pupils',
  'international pupils', 'day pupils', 'boarding ratio',
  'gcse 9 7', 'a level a a', 'boarding fee per term',
  'boarding fee per year', 'registration fee',
  'year 9 10 admissions', 'school view',
]);

function normalizeRowName(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[‐-―−·]/g, ' ')   // hyphens/dashes/middot → space
    .replace(/[^a-z0-9 ]+/g, ' ')              // strip stars/slashes/punct
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateProposedActions(meta, shortlistSlugs) {
  const drop = (key) => { reasons[key] = (reasons[key] || 0) + 1; };
  const reasons = {};
  let totalSeen = 0;

  // Codex round-1 BLOCK #1: when the shortlist has fewer than 2 valid
  // slugs, no proposal can possibly satisfy the "≥ 2 real cells" rule.
  // Hard-skip so the empty-allowlist branch can't accidentally allow
  // every slug.
  if (!Array.isArray(shortlistSlugs) || shortlistSlugs.length < 2) {
    if (meta && meta.proposed_actions && typeof meta.proposed_actions === 'object') {
      const seen = Array.isArray(meta.proposed_actions) ? meta.proposed_actions.length : Object.keys(meta.proposed_actions).length;
      totalSeen += seen;
      drop('shortlist_too_short');
    }
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 } };
  }

  if (!meta || typeof meta !== 'object') {
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 } };
  }
  const raw = meta.proposed_actions;
  if (raw === undefined || raw === null) {
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    drop('not_object');
    return { actions: null, dropped: { byReason: reasons, totalSeen: 1, kept: 0 } };
  }

  const allow = new Set(shortlistSlugs.map(s => String(s).toLowerCase()));
  const out = {};
  let kept = 0;

  for (const [pid, p] of Object.entries(raw)) {
    totalSeen++;
    if (kept >= HARD_PROPOSAL_CAP)                                { drop('over_cap'); continue; }
    if (!PROPOSAL_ID_RE.test(pid))                                { drop('bad_proposal_id'); continue; }
    if (!p || typeof p !== 'object' || Array.isArray(p))          { drop('bad_proposal_shape'); continue; }
    if (p.kind !== 'propose_add_row')                             { drop('bad_kind'); continue; }

    const rn = typeof p.row_name === 'string' ? p.row_name.trim() : '';
    if (rn.length < 1 || rn.length > 80)                          { drop('bad_row_name'); continue; }
    if (SEEDED_ROW_NAMES_NORMALIZED.has(normalizeRowName(rn)))    { drop('seeded_row_name'); continue; }

    const gn = typeof p.group_name === 'string' ? p.group_name.trim() : '';
    if (gn.length < 1 || gn.length > 40)                          { drop('bad_group_name'); continue; }

    let weight = 1;
    if (p.weight !== undefined && p.weight !== null) {
      const w = Number(p.weight);
      if (!Number.isFinite(w) || w < 0 || w > 5)                  { drop('bad_weight'); continue; }
      weight = w;
    }

    if (!p.cell_data || typeof p.cell_data !== 'object' || Array.isArray(p.cell_data)) {
      drop('bad_cell_data_shape'); continue;
    }

    const cleaned = {};
    for (const [slug, cell] of Object.entries(p.cell_data)) {
      const sl = String(slug).toLowerCase();
      if (!allow.has(sl)) continue;                                // off-allowlist — drop cell
      if (!cell || typeof cell !== 'object' || Array.isArray(cell)) continue;

      const v = cell.value === undefined ? null : cell.value;
      const isNumber = typeof v === 'number' && Number.isFinite(v);
      const isString = typeof v === 'string';
      if (v !== null && !isNumber && !isString) continue;
      if (isString && v.length > 80) continue;

      const valueOut = isString ? v.trim() : v;
      const out_cell = { value: valueOut === '' ? null : valueOut };
      if (typeof cell.source === 'string' && HTTPS_URL_RE.test(cell.source)) {
        out_cell.source = cell.source.slice(0, 500);
      }
      if (typeof cell.note === 'string') {
        const note = cell.note.trim().slice(0, 80);
        if (note) out_cell.note = note;
      }
      // Last-write-wins on duplicate normalized slugs (e.g. "Clifton-College"
      // + "clifton-college" both pointing to the same school). The
      // realCellCount tally below runs against `cleaned` after this loop
      // so the output and the count agree on which slugs survived. Codex
      // round-2 BLOCK fix.
      cleaned[sl] = out_cell;
    }

    if (Object.keys(cleaned).length === 0) { drop('empty_after_filter'); continue; }

    // Count real values from `cleaned` AFTER the per-cell loop. Counting
    // inside the loop double-counts case-variant slugs that collapse to
    // one output key (Codex round-2 BLOCK).
    let realCellCount = 0;
    for (const c of Object.values(cleaned)) {
      const v = c.value;
      if (typeof v === 'number' && Number.isFinite(v)) realCellCount++;
      else if (typeof v === 'string' && v.length > 0)  realCellCount++;
    }
    if (realCellCount < 2) { drop('too_few_real_cells'); continue; }

    out[pid] = {
      kind: 'propose_add_row',
      row_name: rn,
      group_name: gn,
      weight,
      cell_data: cleaned,
    };
    kept++;
  }

  return {
    actions: kept > 0 ? out : null,
    dropped: { byReason: reasons, totalSeen, kept },
  };
}

// Find the LAST <!-- nana-meta {...} --> block. The "g" flag + matchAll lets us
// take the final one if a model accidentally emits more than one (e.g. "Here's
// the meta: <!-- ... -->") so we always extract the final structured tail.
const META_RE = /<!--\s*nana-meta\s+(\{[\s\S]*?\})\s*-->/gi;

export function extractMeta(rawText) {
  if (typeof rawText !== 'string') return { prose: '', meta: null };
  const matches = [...rawText.matchAll(META_RE)];
  if (matches.length === 0) return { prose: rawText.trim(), meta: null };
  // Use the LAST block's payload as the canonical meta — if the model echoed
  // the format earlier in prose, prefer the closing tail.
  const last = matches[matches.length - 1];
  let meta = null;
  try {
    meta = JSON.parse(last[1]);
  } catch (_) {
    // Strict JSON only — keep parser deterministic. Visible answer still renders.
  }
  // Strip ALL nana-meta blocks from the visible prose so earlier echoes don't
  // remain. Also collapse any trailing whitespace.
  const prose = rawText.replace(META_RE, '').replace(/[\s\n]+$/g, '').trim();
  return { prose, meta };
}

// ── The runner ───────────────────────────────────────────────────────────
/**
 * runProseFromIntent({ supabase, question, intentMatch, callClaude, opts })
 *
 * `callClaude` is callClaudeStream from nana-brain.js — passed as a dep so
 * this module stays free of Claude transport imports (mirrors how
 * agentic-loop.js takes callClaude as a dep).
 */
export async function* runProseFromIntent({ supabase, question, intentMatch, callClaude, opts = {} }) {
  const t0 = Date.now();
  const signal         = opts.signal || null;
  const parentContext  = opts.parentContext || null;
  const historyContext = opts.historyContext || null;

  // Sanitize the shortlist once: feeds the prompt and the validator. Bad
  // entries fall away; downstream code can trust that every slug in
  // sanitizedShortlist matches ^[a-z0-9-]{1,80}$.
  const sanitizedShortlist = sanitizeShortlistSlugs(opts.shortlistSlugs);

  yield { type: 'answer_format', format: 'prose' };

  // ── Run tools (parallel where the plan allows) ──
  const toolDefs = intentMatch?.plan?.tools || [];
  const parallel = intentMatch?.plan?.parallel === true;

  // Emit started events up front so the UI can render progress.
  for (const def of toolDefs) {
    yield { type: 'tool_call', name: def.name, args: def.args, status: 'started' };
  }

  const allCitations = new Set();
  const toolBlobs    = [];

  async function runOne(def) {
    if (!TOOLS[def.name]) {
      throw new Error(`unknown tool: ${def.name}`);
    }
    const r = await TOOLS[def.name](supabase, def.args);
    return { def, r };
  }

  // Use allSettled so a single tool failure (e.g. vector search timeout)
  // doesn't kill the answer when other tools succeeded. Only abort if the
  // ENTIRE batch fails — the model can still write something useful from
  // partial evidence.
  let settled;
  if (parallel) {
    settled = await Promise.allSettled(toolDefs.map(runOne));
  } else {
    settled = [];
    for (const def of toolDefs) {
      try { settled.push({ status: 'fulfilled', value: await runOne(def) }); }
      catch (e) { settled.push({ status: 'rejected', reason: e }); }
    }
  }
  if (signal?.aborted) return;

  let successCount = 0;
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const def = toolDefs[i];
    if (s.status === 'fulfilled') {
      const { r } = s.value;
      yield {
        type: 'tool_call',
        name: def.name,
        args: def.args,
        status: 'completed',
        result_summary: r.summary,
      };
      // Compatibility flatten: tools.js now returns provenance objects
      // ({url, slug, tool, dimension}). Prose path keeps a flat Set<string>
      // of URLs until PA-0.5b-prose-followup adds the full provenance gate.
      for (const c of r.citations || []) {
        const url = (c && typeof c === 'object') ? c.url : c;
        if (url) allCitations.add(url);
      }
      toolBlobs.push({
        name:    def.name,
        summary: r.summary,
        compact: injectToolResult(def.name, r.result),
      });
      successCount++;
    } else {
      yield {
        type: 'tool_call',
        name: def.name,
        args: def.args,
        status: 'completed',
        result_summary: `(failed: ${s.reason?.message || 'unknown error'})`,
      };
    }
  }

  if (successCount === 0) {
    yield { type: 'error', error: 'prose runner: all tools failed', code: 'tool_error' };
    return;
  }

  // Compatibility retrieval event for downstream consumers (telemetry).
  yield {
    type: 'retrieval',
    payload: { schools: [], agentic: false, prose: true, citations: [...allCitations] },
  };

  // ── One Claude call to write the answer ──
  if (signal?.aborted) return;
  const userMessage = buildUserMessage(question, intentMatch, toolBlobs, parentContext, historyContext);

  const ctx = {};
  let raw = '';
  const claudeStart = Date.now();
  try {
    for await (const chunk of callClaude(PROSE_SYSTEM_PROMPT, null, userMessage, '', ctx, signal)) {
      raw += chunk;
      yield { type: 'token', text: chunk };
    }
  } catch (e) {
    if (signal?.aborted) return;
    yield { type: 'error', error: `prose runner: claude failed — ${e.message}`, code: 'claude_error' };
    return;
  }
  const claudeMs = Date.now() - claudeStart;

  if (signal?.aborted) return;

  // ── Strip the metadata comment, build final payload ──
  const { prose, meta } = extractMeta(raw);
  const schoolsMentioned = Array.isArray(meta?.schools_mentioned) ? meta.schools_mentioned : (intentMatch?.recommendedSchoolSlugs || []);
  const citations        = Array.isArray(meta?.citations)         ? meta.citations         : [...allCitations];

  // Slice 5-FU1 round 6 — two-pass extraction. Pass 1 (the prose
  // generation above) is already complete; pass 2 calls a SEPARATE LLM
  // with the prose + question + shortlist and asks ONLY for the
  // proposed_actions JSON (or {}). One retry on validation failure.
  // See extractProposedActionsTwoPass for the design rationale.
  const proseCitationsList = [...allCitations];
  const { actions: proposedActions, dropped: proposedDropped, usage: extractorUsage } =
    await extractProposedActionsTwoPass({
      callClaude,
      signal,
      question,
      prose,
      shortlistSlugs: sanitizedShortlist,
      citations: proseCitationsList,
      intent: intentMatch?.intent,
    });

  // Telemetry — one line per response. No values, no PII. Reason buckets
  // (extractor_chose_empty / extractor_parse_failure / etc) plus the
  // validator's reasons (too_few_real_cells / off_allowlist / etc).
  const reasonEntries = Object.entries(proposedDropped.byReason);
  const reasonsStr = reasonEntries.length === 0
    ? 'reason=none'
    : reasonEntries.map(([k, v]) => `${k}=${v}`).join(' ');
  console.log('[prose] proposed_actions(2pass) shortlist=%d kept=%d %s',
    sanitizedShortlist.length, proposedDropped.kept, reasonsStr);

  yield {
    type: 'final',
    payload: {
      // `parsed` is what gets persisted to the DB and read by render code.
      // We pack prose answers as { format: 'prose_v1', prose, ... } so the
      // dual-render branch in DecisionHub can sniff and switch.
      parsed: {
        format:           'prose_v1',
        prose,
        schoolsMentioned,
        citations,
        intent:           intentMatch?.intent || null,
        uiIntentHint:     intentMatch?.uiIntent || 'none',
        // Slice 5-FU1 — Nana's "+ Add as row" proposals. Bubble UI reads
        // this from research_session_messages.parsed_answer.proposed_actions
        // (slice 5 wired). confirm_add_row RPC reconstructs the row from
        // this same JSON, so it must already be schema-clean.
        ...(proposedActions ? { proposed_actions: proposedActions } : {}),
      },
      raw:               raw,                    // full original (with meta comment) for audit
      parseError:        null,
      validationIssues:  [],
      claudeMs,
      totalMs:           Date.now() - t0,
      attempt:           1,
      isProseRouter:     true,
      // Codex P2 #9a: surface the underlying provider when the route ran on
      // Gemini (or future adapters). 'router' is the orchestration label;
      // ctx.provider tells you which model bilateral did the work.
      backend:           ctx.provider || 'router',
      // Slice 5-FU1 r6 cost-tracking: usage and cost reflect BOTH passes
      // (prose + extractor). Without summing here the dashboard underreports
      // two-pass cost by ~50%. extractorUsage is preserved separately for
      // future per-pass dashboards.
      usage:             mergeUsage(ctx.usage, extractorUsage),
      proseUsage:        ctx.usage || null,
      extractorUsage:    extractorUsage || null,
      model:             ctx.model || null,
      cost:              (ctx.usage || extractorUsage)
                            ? computeCostUSD(mergeUsage(ctx.usage, extractorUsage), ctx.model)
                            : null,
      retrieval:         { chunkCount: 0, sensitiveCount: 0 },
      proseCitations:    [...allCitations],
      intentMatch:       { intent: intentMatch?.intent, confidence: intentMatch?.confidence },
    },
  };
}
