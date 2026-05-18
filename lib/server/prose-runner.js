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
import { buildPackContextString, shouldInjectPack, logPackTelemetry } from './pack-prompt-injection.js';
// P4 (Codex 2026-05-08 wiring): hallucination guardrail. Telemetry-only for v1
// — logs cited URLs not in pack allowlist, doesn't reject the answer yet.
// Promote to rejection in a follow-up PR after a few days of telemetry.
// Dynamic import to avoid TS-from-JS friction; adds zero cost when pack is null.
let _validateAnswerAgainstPack = null;
async function getValidator() {
  if (_validateAnswerAgainstPack === null) {
    try {
      const mod = await import('./citation-validator.ts');
      _validateAnswerAgainstPack = mod.validateAnswerAgainstPack;
    } catch {
      _validateAnswerAgainstPack = false;
    }
  }
  return _validateAnswerAgainstPack;
}

// Compact prose system prompt. Targets ~2K chars vs the structured chat
// schema's ~17K. Smaller prompt = faster TTFT.
export const PROSE_SYSTEM_PROMPT = `You are Nana, a concise UK independent-schools adviser for parents.

Answer in plain markdown prose using ONLY the tool results provided.
Never invent figures, alumni, fixtures, or fees. When the parent asks
for a ranking or comparison, derive a practical ranking from the
provided data. You may synthesize across fees, academics, location,
pastoral fit, and other returned evidence. Hedge only when a required
input is genuinely absent from the tool results. If the evidence is
thin or contradictory, say so plainly in one short sentence.

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
- No school substitution: if the parent names a comparison pair and one of
  those named schools is absent from the supplied tool results, say that the
  missing school is outside this answer's loaded scope. Do NOT use the host
  school's facts as a proxy for the missing named school, and do NOT relabel
  host facts as if they belonged to that school. Example: on a Wellington
  College answer, if the parent asks "How does Eton compare to Harrow?" but
  Harrow is absent, say: "I don't have Harrow's full breakdown in this scope
  — ask on Harrow's report page for a like-for-like." If the named comparison
  pair does not include the host school, do not volunteer host-school figures
  as a consolation answer.
- Balanced framing: lead with the strongest fact the parent asked about,
  but surface a genuine concern if the data shows one (e.g. an ISI
  compliance flag alongside strong A-levels). Don't manufacture negatives
  to look balanced, but don't suppress real ones the data exposes.
- Thin-data signal density: if the answer rests on a small subset of UK
  schools (e.g. "best value boarding" when only N publish per-term fees),
  name the denominator inline: "Based on the 38 schools that publish
  per-term fees, …". Sounds like an advisor who knows what's documented
  and what isn't. ONLY cite a denominator N when N appears in the tool
  results — never invent a count.
- High-stakes next move: when the question is about money, safety, or fit
  ("worth the fees?", "safe for a shy son?", "right for an ambitious
  athlete?"), end the answer with ONE concrete advisor-style next move
  the parent can act on. Use an imperative verb form: "Ask the bursar
  about scholarship deadlines for next entry", "Request a tour of the
  pastoral house and time with the duty matron", "Email admissions for
  the 2026 entry timetable". Don't tack on a generic information question;
  this final sentence is the takeaway the parent leaves with.
- No headings, no JSON, no code fences, no schema language ("confidence",
  "watch out", "what we don't know"). Write like a human adviser.

Voice — sound like a trusted advisor, not a generic AI assistant:
- Specifics, never platitudes. "94% A*-A at A-level (2024)" not "strong
  academics". If you can't name a fact, that's a data gap, not a sentence.
- No throat-clearing: skip "I'd be happy to help", "Great question",
  "As an AI assistant", "Let me explain", "It's important to note".
- On uncertainty, name the gap + redirect. Sound like an advisor reading
  from the school's records, not an AI describing its own memory — never
  mention dataset/data when hedging. Pattern: "the school's published
  profile doesn't cover [X], but [Y] is on record showing [fact]." Variants:
  "the published records don't go into [X], but [Y]…" / "[X] would be a
  question for the school directly; what IS published is [Y]…"
  GOOD: "ISI inspection details aren't in the published profile here, but
  the 2023 exam results show 78% A*-A — want to dig into those?"
  BAD: "I don't have specific information about that."
  BAD: phrasings that mention the bot's dataset / data / training set /
       memory rather than the school's published profile.
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
export const EXTRACTOR_SYSTEM_PROMPT = `You convert a school-comparison answer into a structured proposal for a parent's comparison table.

You are NOT writing prose. Output JSON only — no markdown fences, no commentary, no explanation. Stop after the closing brace.

Choose ONE of FIVE outputs. At most ONE proposal per call (cap = 1 globally).

A. {}    (no proposal — pick this when none of B/C/D fit cleanly)

B. {"proposed_actions": {"<proposal_id>": {"kind": "propose_add_row", "row_name": "...", "group_name": "...", "weight": 1, "cell_data": {"<slug>": {"value": "...", "source": "https://..."}, "<slug>": {"value": "..."}}}}}

C. {"proposed_actions": {"<proposal_id>": {"kind": "propose_re_rank", "label": "Re-rank by ...", "rationale": "...", "view_spec": {"base_lens_kind": "general", "weights": {"<row_name>": 0..5, ...}}}}}

D. {"proposed_actions": {"<proposal_id>": {"kind": "propose_add_to_letter", "label": "Add to partner brief", "section": "why_it_matters", "body_markdown": "...", "rationale": "..."}}}

E. {"proposed_actions": {"<proposal_id>": {"kind": "propose_create_topic_lens", "topic_name": "Rugby", "lens_name": "Rugby", "base_lens_kind": "general", "embedded_rows": [{"row_name": "...", "group_name": "...", "cell_data": {"<slug>": {"value": "..."}, ...}}, ...], "visible_base_rows": ["School name", "Day fees", ...]}}}

WHEN TO PICK WHICH:

PRIORITY RULE: choose D only when the parent explicitly asks to add/save/put the answer into the partner brief, letter, or note for the other parent. D wins over B/C because this extractor can emit only one proposal. If the parent only asks for a "partner-ready takeaway" but does not ask to save/add it, do not choose D solely for that phrase.

— B (propose_add_row) when the answer compares 2+ schools on a NEW comparable dimension that is NOT in the SEEDED ROWS list and NOT a re-ordering of existing rows. Example: "compare CCF programmes" → new row "CCF programme".

— C (propose_re_rank) when the answer reorders the shortlist using EXISTING comparison rows the parent is already viewing — different weighting of the SAME dimensions, no new dimension introduced. Example: "rank these by academics + value-for-money" → reweight GCSE 9-7 + per-term fees, no new row. Also use C when the parent asks to "save" or "create" a lens — Re-rank + the Save-view chip cover that flow. Do NOT use C when the parent explicitly asked to add/save the answer to the partner brief/letter/note; use D instead.

— D (propose_add_to_letter) when the parent explicitly asks to add/save/put a concise takeaway, tradeoff, question, or next step into the partner brief/letter/note. Use only text grounded in the answer. Do NOT use D for ordinary chat answers, even if they contain a partner-ready paragraph. Do NOT use D for raw facts that belong as comparison rows.

— E (propose_create_topic_lens) when the parent asks to CREATE A LENS / FOCUSED VIEW around a SPECIFIC TOPIC (e.g. "create a lens for rugby", "make a music lens", "build a drama view") and the answer surfaces 2..8 NEW comparable rows about that topic. The topic gets its OWN focused mini-table; topic rows are HIDDEN from General + Child-fit views. NOT for "save the current ranking" (that's C). NOT for "add a single row" (that's B).

— A (empty) when none of the above fit, or when the comparison is too thin (< 2 schools answered, no shortlist, etc).

═══ FIELD RULES (validator drops bad proposals) ═══

ALL kinds:
- proposal_id: ^[a-z0-9_-]{1,40}$  (snake_case slug derived from the row/lens name).
- At most 1 proposal per output. Output A ({}) if you can't produce one cleanly.

B. propose_add_row:
- kind: "propose_add_row"
- row_name: 1..80 chars, plain English. No emoji.
- group_name: 1..40 chars. Use one of: About, Pastoral, Academics, Fees, Admissions, Media, Co-curricular, Sport.
- weight: omit (defaults to 1).
- cell_data: non-empty object. Keys = slugs from SHORTLIST only.
  · "value": ≤ 80 chars label, or null. NOT a sentence.
  · "source": optional https:// URL from citations.
  · "note": optional, ≤ 80 chars.
- Need ≥ 2 cells with real values.
- Do NOT duplicate any SEEDED ROW (list below).

C. propose_re_rank:
- kind: "propose_re_rank"
- label: 1..80 chars, plain English. Starts with verb-ish framing ("Re-rank by …", "Sort by …"). No emoji.
- rationale: 1..240 chars (optional). One short sentence on what the new ranking emphasises.
- view_spec.base_lens_kind: "general" or "child_fit". Use the ACTIVE BASE LENS value from the user message.
- view_spec.weights: object with 1..24 keys. Keys are EXISTING row_names already on the comparison table (the user message lists them). Values numeric 0..5; bigger = more important. Use the labels exactly as they appear in ACTIVE ROWS.
- view_spec.visible_rows: optional array of row_names to FILTER the table down to. Omit unless the answer narrows the focus to a specific subset.

D. propose_add_to_letter:
- kind: "propose_add_to_letter"
- label: 1..80 chars, action label for the button. Plain English, no emoji.
- section: one of "opening", "why_it_matters", "tradeoffs", "questions", "next_step".
- body_markdown: 1..1200 chars. Markdown only. No HTML, no JSON, no code fences.
- rationale: 1..240 chars (optional). Why this belongs in the partner brief.
- Write for the other parent. Mention school names when needed; do not use school slugs as visible prose.

E. propose_create_topic_lens:
- kind: "propose_create_topic_lens"
- topic_name: 1..40 chars. The TOPIC the parent asked about ("Rugby", "Music", "Drama"). Used in the chat pill.
- lens_name: 1..40 chars. Display name for the lens. Usually the same as topic_name; capitalised noun (no verbs, no "Rank by …").
- base_lens_kind: "general" or "child_fit". Use the ACTIVE BASE LENS value from the user message.
- lens_question: optional, ≤ 240 chars. The question the lens answers ("How do these schools compare on rugby?").
- embedded_rows: 2..8 entries. Each entry = a NEW row about the topic.
  · row_name 1..80, group_name 1..40 (use group_name = topic_name).
  · cell_data: object keyed by SHORTLIST slugs only.
    For slugs WITH evidence: { "value": "≤80-char label", "source": "https://..." (optional) }.
    For slugs WITHOUT evidence on this row: omit the slug. The server fills it in
    as { "value": null } so every shortlist column renders. NEVER fabricate values.
  · At least 2 cells must have a real (non-null) value, or the row is dropped.
- visible_base_rows: optional 0..6 entries. Row_names from ACTIVE ROWS that should stay visible alongside the topic rows (e.g. "School name", "Day fees", "Location"). Omit when the answer is purely about the topic.

═══ SEEDED ROWS (do NOT duplicate as add_row; OK to reweight in C) ═══

School type, Location, Travel from Heathrow, Class size, Total pupils, Lowest boarding entry, Boarding pupils, International pupils, Day pupils, Boarding ratio, GCSE 9-7, A-level A*-A, Boarding fee per term, Boarding fee per year, Registration fee, Year 9 / 10 admissions, School view.

═══ EXAMPLES ═══

EXAMPLE B — answer compares CCF programmes:
"Wellington College has stronger CCF evidence: site lists CCF as a core pillar from Year 9 ([source](https://www.wellingtoncollege.org.uk/co-curricular/ccf)). Sherborne School also runs a CCF but voluntary from Y10 ([source](https://www.sherborne.org/our-school/co-curricular))."

You output:
{"proposed_actions":{"ccf_programme":{"kind":"propose_add_row","row_name":"CCF programme","group_name":"Co-curricular","weight":1,"cell_data":{"wellington-college":{"value":"Compulsory from Y9; Army & RAF; weekly + field day","source":"https://www.wellingtoncollege.org.uk/co-curricular/ccf"},"sherborne-school":{"value":"Voluntary from Y10; Army-only","source":"https://www.sherborne.org/our-school/co-curricular"}}}}}

EXAMPLE C — answer reorders shortlist by academics + value (no new row):
"On a combined academics-and-value lens, Marlborough leads (94% A*-A and £15.5k/term), then Wellington (92% A*-A, £16.2k/term), with Eton third on academics-only (96%) but offset by £18k/term."

ACTIVE BASE LENS: general
ACTIVE ROWS: GCSE 9-7, A-level A*-A, Boarding fee per term, Boarding pupils, Total pupils

You output:
{"proposed_actions":{"academics_value":{"kind":"propose_re_rank","label":"Re-rank by academics + value","rationale":"Weights A-level A*-A heavily; treats per-term fees as a counterweight.","view_spec":{"base_lens_kind":"general","weights":{"A-level A*-A":5,"GCSE 9-7":4,"Boarding fee per term":3}}}}}

EXAMPLE D — answer contains a partner-ready takeaway:
"Bryanston looks like the practical first-choice because it matches full boarding, sits within budget, and has the clearest Year 9 sport-scholarship evidence. The gap is CCF: I don't have programme details in the returned sources, so that needs checking before we treat it as a deciding factor."

You output:
{"proposed_actions":{"bryanston_shortlist_note":{"kind":"propose_add_to_letter","label":"Add Bryanston takeaway","section":"why_it_matters","body_markdown":"Bryanston looks like the practical first-choice because it matches full boarding, sits within budget, and has the clearest Year 9 sport-scholarship evidence. The main gap is CCF: we still need direct programme details before using that as a deciding factor.","rationale":"Turns the chat answer into a concise note for the partner brief."}}}

EXAMPLE E — parent asks "create a lens for rugby" and answer surfaces rugby-specific rows:
"On rugby, Wellington runs Tier 1 with a former England international as Director ([source](https://www.wellingtoncollege.org.uk/sport/rugby)). Sherborne is Tier 2 — strong fixtures but no national pathway. Marlborough Tier 2 — historically rugby-strong, fixtures vs. Radley + Cheltenham."

ACTIVE BASE LENS: general
ACTIVE ROWS: School name, Total pupils, GCSE 9-7, Boarding fee per term

You output:
{"proposed_actions":{"rugby_lens":{"kind":"propose_create_topic_lens","topic_name":"Rugby","lens_name":"Rugby","base_lens_kind":"general","embedded_rows":[{"row_name":"Rugby tier","group_name":"Rugby","cell_data":{"wellington-college":{"value":"Tier 1"},"sherborne-school":{"value":"Tier 2"},"marlborough-college":{"value":"Tier 2"}}},{"row_name":"Director of rugby","group_name":"Rugby","cell_data":{"wellington-college":{"value":"Former England international","source":"https://www.wellingtoncollege.org.uk/sport/rugby"},"sherborne-school":{"value":"School-level coach"}}},{"row_name":"National pathway","group_name":"Rugby","cell_data":{"wellington-college":{"value":"Yes"},"sherborne-school":{"value":"No"},"marlborough-college":{"value":"No"}}}],"visible_base_rows":["School name","Boarding fee per term"]}}}

═══ CRITICAL ═══

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

// Slice 6: ACTIVE BASE LENS + ACTIVE ROWS injected so the extractor can
// emit propose_re_rank with row_name keys that match what the parent
// currently sees. Without these, the model would have to guess at which
// dimensions exist on the table.
function buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback, baseLensKind, activeRowNames }) {
  const lines = [
    `QUESTION: ${question}`,
    '',
    "ANSWER (Nana's prose):",
    prose,
    '',
    'SHORTLIST (you may ONLY use these slugs as cell_data keys for B propose_add_row + D propose_create_topic_lens.embedded_rows[*].cell_data):',
    ...shortlistSlugs.map(s => `  - ${s}`),
  ];

  // Slice 6 — context for C proposals. Always emit the two lines so the
  // model can't infer that re_rank is unavailable when active rows are
  // empty (it IS unavailable in that case, but the validator catches it;
  // the prompt stays uniform).
  lines.push('', `ACTIVE BASE LENS: ${baseLensKind || 'general'}    (use this in view_spec.base_lens_kind for C)`);
  if (Array.isArray(activeRowNames) && activeRowNames.length > 0) {
    lines.push('', 'ACTIVE ROWS (use these labels EXACTLY as keys in view_spec.weights / visible_rows for C):');
    for (const rn of activeRowNames.slice(0, 30)) lines.push(`  - ${rn}`);
  } else {
    lines.push('', 'ACTIVE ROWS: (none currently — propose_re_rank not viable)');
  }

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
  // Slice 6 additions. baseLensKind defaults to 'general' so the extractor
  // can produce coherent view-spec proposals even before the runner threads the
  // active lens through. activeRowNames is the loader-provided list of
  // row labels currently visible on the comparison table; used by the
  // validator to keep weights/visible_rows scoped to existing rows.
  baseLensKind = 'general',
  activeRowNames = [],
}) {
  // Cost-tracking follow-up: every code path that returns from this
  // function carries a `usage` object summing the extractor's own
  // token usage (1 attempt or 2). Callers merge this with pass-1 usage
  // before logging to nana_chat_logs.
  const empty = (reason, usage = null) => ({
    actions: null,
    dropped: { byReason: reason ? { [reason]: 1 } : {}, totalSeen: 0, kept: 0 },
    kept:    { total: 0, byKind: { propose_add_row: 0, propose_re_rank: 0, propose_create_lens: 0, propose_add_to_letter: 0, propose_create_topic_lens: 0 } },
    usage,
  });

  if (!intent || !COMPARISON_INTENTS.has(intent))                  return empty('extractor_skipped_non_comparison_intent');
  if (!Array.isArray(shortlistSlugs) || shortlistSlugs.length < 2) return empty('extractor_skipped_short_shortlist');
  if (typeof prose !== 'string' || prose.trim().length < 50)       return empty('extractor_skipped_short_prose');

  // Validator context shared between attempts.
  const validatorCtx = { shortlistSlugs, baseLensKind, activeRowNames };

  // Attempt 1
  const ctx1 = {};
  let raw1;
  try {
    raw1 = await callExtractorOnce(
      callClaude, signal, ctx1,
      EXTRACTOR_SYSTEM_PROMPT,
      buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback: null, baseLensKind, activeRowNames }),
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

  const result1 = validateProposedActions(parsed1, validatorCtx);
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
      buildExtractorUserMessage({ question, prose, shortlistSlugs, citations, feedback, baseLensKind, activeRowNames }),
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
      kept:  result1.kept || { total: 0, byKind: { propose_add_row: 0, propose_re_rank: 0, propose_create_lens: 0, propose_add_to_letter: 0, propose_create_topic_lens: 0 } },
      usage: usageBoth,
    };
  }
  if (typeof parsed2 === 'object' && !Array.isArray(parsed2) && Object.keys(parsed2).length === 0) {
    return empty('extractor_chose_empty', usageBoth);
  }
  const result2 = validateProposedActions(parsed2, validatorCtx);
  return result2.actions
    ? { ...result2, usage: usageBoth }
    : { ...result1,  usage: usageBoth };
}

// Slice 5-FU1 / Slice 6 — proposed_actions validation (kind-dispatch).
//
// The RPCs `confirm_add_row` and `confirm_lens_from_proposal` are the
// trust boundaries; this function is UX hardening, not security. It
// mirrors each RPC's bounds and adds extractor-side rules the RPC
// doesn't enforce (slug allowlist for add_row, seeded-row dedup, etc.).
// Bad entries are dropped silently. The visible answer still renders.
//
// Returns { actions, dropped: { byReason, totalSeen, kept } } so the
// caller can log a single line per response without leaking values.
//
// Slice 6 dispatch table by `kind`:
//   propose_add_row       → validateAddRowProposal
//   propose_re_rank       → validateReRankProposal
//   propose_create_lens   → validateCreateLensProposal
//   propose_add_to_letter → validateAddToLetterProposal
const PROPOSAL_ID_RE    = /^[a-zA-Z0-9_-]{1,40}$/;
// Codex round-2 nit: only https:// citations should pass through. The
// citations[] list elsewhere in the prompt insists on https:// and the
// bubble UI renders these as user-clickable links.
const HTTPS_URL_RE      = /^https:\/\//i;
// Slice 7: prompt explicitly says "Choose ONE of FOUR outputs / At most
// ONE proposal per call" — align the validator cap. Slice-5's 2 was a holdover
// from when the prompt allowed two add_row proposals per response. With
// re-rank added, two-proposal UX gets confusing and the prompt no longer
// encourages it.
const HARD_PROPOSAL_CAP = 1;
const VALID_BASE_LENS_KINDS = new Set(['general', 'child_fit']);
const ADD_TO_LETTER_SECTIONS = new Set(['opening', 'why_it_matters', 'tradeoffs', 'questions', 'next_step']);

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

// ── Per-kind validators ─────────────────────────────────────────────────
// Each returns { ok: true, proposal } on accept or { ok: false, reason }
// on reject. The outer dispatcher aggregates kept/dropped reasons.

function validateAddRowProposal(p, ctx) {
  const { shortlistSlugs } = ctx;

  const rn = typeof p.row_name === 'string' ? p.row_name.trim() : '';
  if (rn.length < 1 || rn.length > 80)                       return { ok: false, reason: 'bad_row_name' };
  if (SEEDED_ROW_NAMES_NORMALIZED.has(normalizeRowName(rn))) return { ok: false, reason: 'seeded_row_name' };

  const gn = typeof p.group_name === 'string' ? p.group_name.trim() : '';
  if (gn.length < 1 || gn.length > 40)                       return { ok: false, reason: 'bad_group_name' };

  let weight = 1;
  if (p.weight !== undefined && p.weight !== null) {
    const w = Number(p.weight);
    if (!Number.isFinite(w) || w < 0 || w > 5)               return { ok: false, reason: 'bad_weight' };
    weight = w;
  }

  if (!p.cell_data || typeof p.cell_data !== 'object' || Array.isArray(p.cell_data)) {
    return { ok: false, reason: 'bad_cell_data_shape' };
  }

  const allow = new Set(shortlistSlugs.map(s => String(s).toLowerCase()));
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
    // Last-write-wins on duplicate normalized slugs (Codex round-2 BLOCK).
    cleaned[sl] = out_cell;
  }

  if (Object.keys(cleaned).length === 0) return { ok: false, reason: 'empty_after_filter' };

  let realCellCount = 0;
  for (const c of Object.values(cleaned)) {
    const v = c.value;
    if (typeof v === 'number' && Number.isFinite(v)) realCellCount++;
    else if (typeof v === 'string' && v.length > 0)  realCellCount++;
  }
  if (realCellCount < 2) return { ok: false, reason: 'too_few_real_cells' };

  return {
    ok: true,
    proposal: {
      kind: 'propose_add_row',
      row_name: rn,
      group_name: gn,
      weight,
      cell_data: cleaned,
    },
  };
}

// Shared view_spec validator for lens/re-rank proposals. Returns
// { ok, view_spec, reason }.
// view_spec.weights and visible_rows are KEPT AS row_name strings here —
// the RPC resolves them to UUIDs against comparison_rows at confirm-time.
//
// Slice 6 r2 P1 fixes (Codex):
//   1. Canonical labels: ctx.activeRowsByNorm is a Map<normalized, canonical>.
//      The model's emitted row label is normalized for matching, but the
//      CANONICAL form (as it appears on the actual table) is what gets
//      written into cleanedWeights. This keeps JS validation and SQL
//      resolution in agreement — `lower(btrim(...))` in the RPC matches
//      the canonical label byte-for-byte.
//   2. No shape-only fallback. If the runner can't supply activeRowsByNorm
//      (no active rows known), C/D refuses outright. The previous
//      "shape-only when empty" mode was a footgun: model emits a
//      proposal whose row labels don't exist on the table → RPC returns
//      empty_after_resolution → user sees "save failed".
//   3. base_lens_kind must equal ctx.baseLensKind. Model can't override
//      the user's active base.
function validateViewSpec(spec, ctx) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, reason: 'bad_view_spec' };
  }

  // Refuse view-spec proposals entirely without a canonical-label map. See header comment.
  const activeRowsByNorm = ctx.activeRowsByNorm;
  if (!(activeRowsByNorm instanceof Map) || activeRowsByNorm.size === 0) {
    return { ok: false, reason: 'view_spec_no_active_rows' };
  }

  const baseLensKind = spec.base_lens_kind;
  if (typeof baseLensKind !== 'string' || !VALID_BASE_LENS_KINDS.has(baseLensKind)) {
    return { ok: false, reason: 'bad_base_lens_kind' };
  }
  // Codex r1 P1.3: enforce equality with ctx.baseLensKind so the model
  // can't pick the wrong base when active is child_fit.
  if (baseLensKind !== ctx.baseLensKind) {
    return { ok: false, reason: 'view_spec_base_lens_mismatch' };
  }

  // weights: object, 1..24 keys, values 0..5 numeric.
  const weights = spec.weights;
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    return { ok: false, reason: 'bad_view_spec_weights' };
  }
  const weightKeys = Object.keys(weights);
  if (weightKeys.length < 1 || weightKeys.length > 24) {
    return { ok: false, reason: 'bad_view_spec_weights' };
  }

  const cleanedWeights = {};
  for (const k of weightKeys) {
    if (typeof k !== 'string' || k.length < 1 || k.length > 80) continue;
    const v = weights[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 5) continue;
    const canonical = activeRowsByNorm.get(normalizeRowName(k));
    if (!canonical) continue;                  // unknown row label — drop silently
    cleanedWeights[canonical] = v;             // CANONICAL form, not model's variant (last-write-wins on dupes)
  }

  // Codex r2: compute weightSum from the FINAL cleanedWeights (post
  // canonical collapse), not from the loop. Two model keys that
  // normalize to the same row would otherwise inflate weightSum even
  // though only the last write survives.
  const cleanedValues = Object.values(cleanedWeights);
  const matchedRows = cleanedValues.length;
  const weightSum = cleanedValues.reduce((s, v) => s + v, 0);

  if (matchedRows < 1) return { ok: false, reason: 'view_spec_no_active_rows_matched' };
  // Codex r1 P2: reject zero-total view specs (every weight = 0). Valid JSON
  // but semantically a no-op; lens UI would render unchanged.
  if (weightSum <= 0) return { ok: false, reason: 'view_spec_zero_total_weight' };

  // visible_rows: optional, ≤ 50 entries, each 1..80 chars; drop unmatched.
  let cleanedVisible = null;
  if (spec.visible_rows !== undefined && spec.visible_rows !== null) {
    if (!Array.isArray(spec.visible_rows) || spec.visible_rows.length > 50) {
      return { ok: false, reason: 'bad_view_spec_visible_rows' };
    }
    const acc = [];
    const seen = new Set();
    for (const entry of spec.visible_rows) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed.length < 1 || trimmed.length > 80) continue;
      const canonical = activeRowsByNorm.get(normalizeRowName(trimmed));
      if (!canonical) continue;
      if (seen.has(canonical)) continue;       // dedupe
      seen.add(canonical);
      acc.push(canonical);
    }
    cleanedVisible = acc;
    // If the model supplied visible_rows but nothing survived, refuse —
    // mirrors the RPC's empty_after_resolution status.
    if (acc.length === 0) return { ok: false, reason: 'view_spec_visible_empty_after_filter' };
  }

  const cleanedSpec = {
    base_lens_kind: baseLensKind,
    weights: cleanedWeights,
  };
  if (cleanedVisible !== null) cleanedSpec.visible_rows = cleanedVisible;
  return { ok: true, view_spec: cleanedSpec };
}

function validateReRankProposal(p, ctx) {
  const label = typeof p.label === 'string' ? p.label.trim() : '';
  if (label.length < 1 || label.length > 80)                  return { ok: false, reason: 'bad_label' };

  let rationale;
  if (p.rationale !== undefined && p.rationale !== null) {
    if (typeof p.rationale !== 'string')                      return { ok: false, reason: 'bad_rationale' };
    const r = p.rationale.trim();
    if (r.length > 240)                                       return { ok: false, reason: 'bad_rationale' };
    if (r.length > 0) rationale = r;
  }

  const vs = validateViewSpec(p.view_spec, ctx);
  if (!vs.ok) return { ok: false, reason: vs.reason };

  const out = {
    kind: 'propose_re_rank',
    label,
    view_spec: vs.view_spec,
  };
  if (rationale !== undefined) out.rationale = rationale;
  return { ok: true, proposal: out };
}

function validateCreateLensProposal(p, ctx) {
  const lensName = typeof p.lens_name === 'string' ? p.lens_name.trim() : '';
  if (lensName.length < 1 || lensName.length > 40)            return { ok: false, reason: 'bad_lens_name' };

  let lensQuestion;
  if (p.lens_question !== undefined && p.lens_question !== null) {
    if (typeof p.lens_question !== 'string')                  return { ok: false, reason: 'bad_lens_question' };
    const q = p.lens_question.trim();
    if (q.length > 240)                                       return { ok: false, reason: 'bad_lens_question' };
    if (q.length > 0) lensQuestion = q;
  }

  const vs = validateViewSpec(p.view_spec, ctx);
  if (!vs.ok) return { ok: false, reason: vs.reason };

  const out = {
    kind: 'propose_create_lens',
    lens_name: lensName,
    view_spec: vs.view_spec,
  };
  if (lensQuestion !== undefined) out.lens_question = lensQuestion;
  return { ok: true, proposal: out };
}

function validateAddToLetterProposal(p, ctx) {
  const label = typeof p.label === 'string' ? p.label.trim() : '';
  if (label.length < 1 || label.length > 80)                  return { ok: false, reason: 'bad_label' };

  const section = typeof p.section === 'string' ? p.section.trim() : '';
  if (!ADD_TO_LETTER_SECTIONS.has(section))                   return { ok: false, reason: 'bad_letter_section' };

  const body = typeof p.body_markdown === 'string' ? p.body_markdown.trim() : '';
  if (body.length < 1 || body.length > 1200)                  return { ok: false, reason: 'bad_letter_body' };
  if (/```/.test(body))                                       return { ok: false, reason: 'letter_body_code_fence' };
  if (/[{}][\s\S]*:/.test(body))                              return { ok: false, reason: 'letter_body_json_like' };
  if (/<[a-z][\s\S]*>/i.test(body))                           return { ok: false, reason: 'letter_body_html' };

  let rationale;
  if (p.rationale !== undefined && p.rationale !== null) {
    if (typeof p.rationale !== 'string')                      return { ok: false, reason: 'bad_rationale' };
    const r = p.rationale.trim();
    if (r.length > 240)                                       return { ok: false, reason: 'bad_rationale' };
    if (/<[a-z][\s\S]*>/i.test(r))                            return { ok: false, reason: 'rationale_html' };
    if (r.length > 0) rationale = r;
  }

  const out = {
    kind: 'propose_add_to_letter',
    label,
    section,
    body_markdown: body,
  };
  if (rationale !== undefined) out.rationale = rationale;
  return { ok: true, proposal: out };
}

// Slice 6.5 — propose_create_topic_lens. Mirrors validateAddRowProposal
// for each embedded row (same shortlist allowlist + cell shape + ≥ 2 real
// cells rule), then validates the lens-level fields. base_lens_kind must
// match ctx.baseLensKind (same rule as C — model can't override the
// user's active base). visible_base_rows entries are KEPT AS row_name
// strings; the RPC resolves them to UUIDs against base rows.
function validateCreateTopicLensProposal(p, ctx) {
  const { shortlistSlugs } = ctx;

  const topicName = typeof p.topic_name === 'string' ? p.topic_name.trim() : '';
  if (topicName.length < 1 || topicName.length > 40)         return { ok: false, reason: 'bad_topic_name' };

  const lensName = typeof p.lens_name === 'string' ? p.lens_name.trim() : '';
  if (lensName.length < 1 || lensName.length > 40)           return { ok: false, reason: 'bad_lens_name' };

  let lensQuestion;
  if (p.lens_question !== undefined && p.lens_question !== null) {
    if (typeof p.lens_question !== 'string')                 return { ok: false, reason: 'bad_lens_question' };
    const q = p.lens_question.trim();
    if (q.length > 240)                                      return { ok: false, reason: 'bad_lens_question' };
    if (q.length > 0) lensQuestion = q;
  }

  const baseLensKind = p.base_lens_kind;
  if (typeof baseLensKind !== 'string' || !VALID_BASE_LENS_KINDS.has(baseLensKind)) {
    return { ok: false, reason: 'bad_base_lens_kind' };
  }
  if (baseLensKind !== ctx.baseLensKind) {
    return { ok: false, reason: 'topic_lens_base_lens_mismatch' };
  }

  if (!Array.isArray(p.embedded_rows))                       return { ok: false, reason: 'bad_embedded_rows_shape' };
  // Cap at 8 in the validator — the prompt asks for 2..8 to keep the
  // mini-table focused. The RPC accepts up to 24 as a defence-in-depth
  // upper bound, but the validator is the product UX gate.
  if (p.embedded_rows.length < 2 || p.embedded_rows.length > 8) {
    return { ok: false, reason: 'bad_embedded_rows_count' };
  }

  const allow = new Set(shortlistSlugs.map(s => String(s).toLowerCase()));
  const cleanedRows = [];
  const seenNorms = new Set();
  for (const r of p.embedded_rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r))     return { ok: false, reason: 'bad_embedded_row_shape' };

    const rn = typeof r.row_name === 'string' ? r.row_name.trim() : '';
    if (rn.length < 1 || rn.length > 80)                     return { ok: false, reason: 'bad_embedded_row_name' };
    if (SEEDED_ROW_NAMES_NORMALIZED.has(normalizeRowName(rn))) {
      // Topic rows that reuse a seeded row's name would shadow the base
      // row under the topic lens. Reject — the model should surface a
      // genuinely new dimension.
      return { ok: false, reason: 'embedded_row_seeded_name' };
    }
    const norm = normalizeRowName(rn);
    if (seenNorms.has(norm))                                 return { ok: false, reason: 'embedded_row_duplicate_name' };
    seenNorms.add(norm);

    const gn = typeof r.group_name === 'string' ? r.group_name.trim() : '';
    if (gn.length < 1 || gn.length > 40)                     return { ok: false, reason: 'bad_embedded_group_name' };

    let weight = 1;
    if (r.weight !== undefined && r.weight !== null) {
      const w = Number(r.weight);
      if (!Number.isFinite(w) || w < 0 || w > 5)             return { ok: false, reason: 'bad_embedded_weight' };
      weight = w;
    }

    if (!r.cell_data || typeof r.cell_data !== 'object' || Array.isArray(r.cell_data)) {
      return { ok: false, reason: 'bad_embedded_cell_data_shape' };
    }

    const cleaned = {};
    for (const [slug, cell] of Object.entries(r.cell_data)) {
      const sl = String(slug).toLowerCase();
      if (!allow.has(sl)) continue;
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
      cleaned[sl] = out_cell;
    }

    // Slice 6.6 brain-fix: weak rows are SKIPPED, not fatal. Pre-fix the
    // realCellCount < 2 case + the empty-after-filter case both dropped
    // the entire topic-lens proposal — including any sibling rows that
    // were perfectly fine. Now skip the bad row and let the parent
    // proposal stand if at least 2 sibling rows survive (cleanedRows.length
    // check after the loop).
    if (Object.keys(cleaned).length === 0) continue;

    let realCellCount = 0;
    for (const c of Object.values(cleaned)) {
      const v = c.value;
      if (typeof v === 'number' && Number.isFinite(v)) realCellCount++;
      else if (typeof v === 'string' && v.length > 0)  realCellCount++;
    }
    if (realCellCount < 2) continue;

    // Slice 6.6 brain-fix: deterministic null-fill for missing shortlist
    // slugs. Nana is told to emit only the cells she has evidence for;
    // the validator pads the rest with { value: null } so the table
    // renders every shortlist column (— for unknowns instead of an
    // entirely missing column). Pairs with the null-safe merge in the
    // 2026-05-12 RPC migration: nulls pass through the validator into
    // the proposal, but the merge UPDATE filters them out so existing
    // real values aren't clobbered when Nana's coverage drifts.
    for (const sl of allow) {
      if (!Object.prototype.hasOwnProperty.call(cleaned, sl)) {
        cleaned[sl] = { value: null };
      }
    }

    cleanedRows.push({
      row_name:   rn,
      group_name: gn,
      weight,
      cell_data:  cleaned,
    });
  }
  if (cleanedRows.length < 2)                                return { ok: false, reason: 'embedded_rows_too_few_after_filter' };

  // visible_base_rows: optional, 0..6 entries. Resolved by the RPC at
  // confirm-time; here we only sanity-check the shape and length, then
  // canonicalise against ctx.activeRowsByNorm so the SQL resolver
  // matches byte-for-byte (same trick as C).
  let cleanedVisibleBaseRows;
  if (p.visible_base_rows !== undefined && p.visible_base_rows !== null) {
    if (!Array.isArray(p.visible_base_rows))                 return { ok: false, reason: 'bad_visible_base_rows_shape' };
    if (p.visible_base_rows.length > 6)                      return { ok: false, reason: 'bad_visible_base_rows_count' };

    const out = [];
    const seen = new Set();
    for (const item of p.visible_base_rows) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (trimmed.length < 1 || trimmed.length > 80) continue;
      const itemNorm = normalizeRowName(trimmed);
      if (!itemNorm || seen.has(itemNorm)) continue;
      const canonical = ctx.activeRowsByNorm instanceof Map
        ? ctx.activeRowsByNorm.get(itemNorm)
        : null;
      if (!canonical) continue;       // unknown base-row label — drop silently
      seen.add(itemNorm);
      out.push(canonical);
    }
    if (out.length > 0) cleanedVisibleBaseRows = out;
  }

  const out = {
    kind: 'propose_create_topic_lens',
    topic_name: topicName,
    lens_name: lensName,
    base_lens_kind: baseLensKind,
    embedded_rows: cleanedRows,
  };
  if (lensQuestion !== undefined) out.lens_question = lensQuestion;
  if (cleanedVisibleBaseRows !== undefined) out.visible_base_rows = cleanedVisibleBaseRows;
  return { ok: true, proposal: out };
}

const KIND_VALIDATORS = {
  propose_add_row:           validateAddRowProposal,
  propose_re_rank:           validateReRankProposal,
  propose_create_lens:       validateCreateLensProposal,
  propose_add_to_letter:     validateAddToLetterProposal,
  propose_create_topic_lens: validateCreateTopicLensProposal,
};

// validateProposedActions(meta, ctx)
//
// Slice 6 signature: ctx is { shortlistSlugs, baseLensKind, activeRowNames }.
// Backward-compat: if ctx is an array, treat it as legacy shortlistSlugs
// and default the rest. Old test harnesses keep working.
//
// Slice 6 r2: returns { actions, dropped, kept } where kept.byKind is a
// per-kind counter — split out of dropped.byReason so logs read cleanly
// (`kept.byKind.propose_re_rank=1` vs `dropped.byReason.kept_kind_*`).
// Codex r1 P2 fix.
export function validateProposedActions(meta, ctx) {
  const drop = (key) => { reasons[key] = (reasons[key] || 0) + 1; };
  const reasons = {};
  const keptByKind = { propose_add_row: 0, propose_re_rank: 0, propose_create_lens: 0, propose_add_to_letter: 0, propose_create_topic_lens: 0 };
  let totalSeen = 0;

  // Normalize ctx for legacy callers passing a bare array.
  const normCtx = Array.isArray(ctx)
    ? { shortlistSlugs: ctx, baseLensKind: 'general', activeRowNames: [] }
    : (ctx && typeof ctx === 'object'
        ? { shortlistSlugs: ctx.shortlistSlugs || [], baseLensKind: ctx.baseLensKind || 'general', activeRowNames: ctx.activeRowNames || [] }
        : { shortlistSlugs: [], baseLensKind: 'general', activeRowNames: [] });

  // Codex r1 P1.1: build a normalized → canonical map ONCE per call.
  // The view-spec validator looks up by normalized key but writes the canonical
  // form into the proposal so the SQL resolver (lower(btrim(...))) can
  // match it byte-for-byte. Without this, em-dash/hyphen drift causes
  // JS validation to pass while RPC returns empty_after_resolution.
  //
  // Codex r2 hardening: when two active rows collapse to the same
  // normalized key (e.g. an existing "GCSE 9-7" plus a chat-added
  // "GCSE 9 7"), the row label is ambiguous. Rather than first/last-
  // write-win (either choice silently picks one row), drop both from
  // the map so the model's emit doesn't match either. The DB unique
  // index makes this rare in practice but the validator handles it
  // defensively.
  const activeRowsByNorm = new Map();
  const collidedNorms    = new Set();
  for (const rn of normCtx.activeRowNames) {
    if (typeof rn !== 'string') continue;
    const trimmed = rn.trim();
    if (trimmed.length === 0 || trimmed.length > 80) continue;
    const norm = normalizeRowName(trimmed);
    if (!norm) continue;
    if (collidedNorms.has(norm)) continue;            // already poisoned
    if (activeRowsByNorm.has(norm) && activeRowsByNorm.get(norm) !== trimmed) {
      activeRowsByNorm.delete(norm);
      collidedNorms.add(norm);
      continue;
    }
    activeRowsByNorm.set(norm, trimmed);
  }
  normCtx.activeRowsByNorm = activeRowsByNorm;

  // Codex slice-5 round-1 BLOCK #1: when the shortlist has fewer than 2
  // valid slugs, no add_row proposal can satisfy the "≥ 2 real cells"
  // rule. re_rank doesn't depend on shortlist length but also wouldn't
  // make sense without ≥ 2 schools to compare. Hard-skip.
  if (!Array.isArray(normCtx.shortlistSlugs) || normCtx.shortlistSlugs.length < 2) {
    if (meta && meta.proposed_actions && typeof meta.proposed_actions === 'object') {
      const seen = Array.isArray(meta.proposed_actions) ? meta.proposed_actions.length : Object.keys(meta.proposed_actions).length;
      totalSeen += seen;
      drop('shortlist_too_short');
    }
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 }, kept: { total: 0, byKind: keptByKind } };
  }

  if (!meta || typeof meta !== 'object') {
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 }, kept: { total: 0, byKind: keptByKind } };
  }
  const raw = meta.proposed_actions;
  if (raw === undefined || raw === null) {
    return { actions: null, dropped: { byReason: reasons, totalSeen, kept: 0 }, kept: { total: 0, byKind: keptByKind } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    drop('not_object');
    return { actions: null, dropped: { byReason: reasons, totalSeen: 1, kept: 0 }, kept: { total: 0, byKind: keptByKind } };
  }

  const out = {};
  let kept = 0;

  for (const [pid, p] of Object.entries(raw)) {
    totalSeen++;
    if (kept >= HARD_PROPOSAL_CAP)                              { drop('over_cap'); continue; }
    if (!PROPOSAL_ID_RE.test(pid))                              { drop('bad_proposal_id'); continue; }
    if (!p || typeof p !== 'object' || Array.isArray(p))        { drop('bad_proposal_shape'); continue; }

    const validator = KIND_VALIDATORS[p.kind];
    if (!validator)                                             { drop('bad_kind'); continue; }

    const result = validator(p, normCtx);
    if (!result.ok) { drop(result.reason); continue; }

    out[pid] = result.proposal;
    keptByKind[p.kind] = (keptByKind[p.kind] || 0) + 1;
    kept++;

    // Slice 6 close · Codex NIT: the prompt no longer mentions
    // propose_create_lens, but the validator entry is retained so the
    // RPC + topic-lens slice (6.5) can reuse the trust boundary. Log
    // when a model regresses and emits the kind anyway — silent kept-
    // counts would let drift go unnoticed.
    if (p.kind === 'propose_create_lens') {
      console.warn('[prose-runner] propose_create_lens emitted by extractor — prompt drift?', { proposal_id: pid });
    }
  }

  return {
    actions: kept > 0 ? out : null,
    dropped: { byReason: reasons, totalSeen, kept },
    kept:    { total: kept, byKind: keptByKind },
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
  let   parentContext  = opts.parentContext || null;
  const historyContext = opts.historyContext || null;

  // P2: Research Context Pack injection. Appends pack-derived prose to
  // parentContext when opts.pack is present. When NANA_PACK_V1 is OFF,
  // opts.pack is null and this is a no-op. See ~/notes/research-panel-
  // excellence-plan.md §P2.
  if (shouldInjectPack(opts.pack)) {
    const packStr = buildPackContextString(opts.pack);
    if (packStr) {
      parentContext = parentContext ? `${parentContext}\n${packStr}` : packStr;
      logPackTelemetry('proseRunner', opts.pack);
    }
  }

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

  // Pre-enable-1 (Gap A): scorer side-channel. Pulls parent prefs from the
  // research pack when present. Scorers null-short-circuit on missing keys,
  // so an empty/null parent here is safe.
  const toolCtx = { parent: opts.pack?.parent ?? null };

  async function runOne(def) {
    if (!TOOLS[def.name]) {
      throw new Error(`unknown tool: ${def.name}`);
    }
    const r = await TOOLS[def.name](supabase, def.args, toolCtx);
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

  // P6 — promoted from telemetry-only to enforcing. Capture
  // ValidationResult into `validationIssues: string[]` so downstream UI
  // (NanaBubble prose-mode citations, NanaPanel) can hide unverifiable
  // sources rather than show them. Strings are shaped to match
  // NanaPanel's citationFailure regex (/sources_used|source_url|citation/i)
  // so a single regex covers both runners. Validator failure must NEVER
  // break the chat — exception path keeps validationIssues empty.
  let validationIssues = [];
  if (opts.pack) {
    try {
      const validator = await getValidator();
      if (typeof validator === 'function') {
        const result = validator(raw, opts.pack);
        if (!result.ok) {
          for (const u of result.hallucinated_urls) {
            validationIssues.push(`prose source_url not in pack allowlist: ${u}`);
          }
          for (const s of result.out_of_scope_slugs) {
            validationIssues.push(`prose citation slug out of pack scope: ${s}`);
          }
          console.warn(
            `[prose-runner:p6-validator] ok=false hallucinated_urls=${result.hallucinated_urls.length} out_of_scope_slugs=${result.out_of_scope_slugs.length} notes=${result.notes.join('; ')}`,
          );
        }
      }
    } catch (e) {
      // Validator failure must NEVER break the chat. Log + carry on.
      console.error('[prose-runner:p6-validator] failed:', e?.message ?? e);
    }
  }

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
  // Slice 6: thread baseLensKind + activeRowNames through so Pass 2 can
  // emit propose_re_rank with row labels that match what's currently on
  // the comparison table. Defaults are permissive — runner callers
  // (route, eval harness) wire these from research_sessions.active_lens_id
  // + comparison_rows when available. When activeRowNames is empty, the
  // validator REFUSES C entirely (no shape-only fallback — Codex r2 P1.2).
  // B propose_add_row is unaffected and continues to fire from this code
  // path.
  const baseLensKindOpt   = typeof opts.baseLensKind === 'string' && VALID_BASE_LENS_KINDS.has(opts.baseLensKind)
    ? opts.baseLensKind
    : 'general';
  // Codex r1 P2.6: keep ALL valid names for validation (canonical-label
  // map needs the full set). Prompt-side slicing happens inside
  // buildExtractorUserMessage. Cap at 100 here to bound prompt-injection
  // surface from a misbehaving caller.
  const activeRowNamesOpt = Array.isArray(opts.activeRowNames)
    ? opts.activeRowNames.filter(s => typeof s === 'string' && s.length > 0 && s.length <= 80).slice(0, 100)
    : [];

  const { actions: proposedActions, dropped: proposedDropped, kept: proposedKept, usage: extractorUsage } =
    await extractProposedActionsTwoPass({
      callClaude,
      signal,
      question,
      prose,
      shortlistSlugs: sanitizedShortlist,
      citations: proseCitationsList,
      intent: intentMatch?.intent,
      baseLensKind:   baseLensKindOpt,
      activeRowNames: activeRowNamesOpt,
    });

  // T4.18 — post-validation projector-fill for propose_create_topic_lens.
  // No-op when NANA_TOPIC_LENS_FACTS=off (default). When on, walks any
  // topic-lens proposal and fills slugs with `value: null` from the
  // dimension's school_fact_projections via loadDimensionEvidencePack.
  // Existing LLM-emitted real values are preserved; only null cells
  // are candidates. Failures degrade silently to today's null-fill.
  let topicLensFillTel = null;
  try {
    const { applyTopicLensProjectorFill } = await import('./topic-lens-projector-fill');
    topicLensFillTel = await applyTopicLensProjectorFill(supabase, proposedActions, sanitizedShortlist);
  } catch (e) {
    console.error('[prose] topic-lens projector-fill failed:', e?.message ?? String(e));
  }

  // Telemetry — one line per response. No values, no PII.
  // Slice 6 r2 P2: kept now split out into proposedKept.byKind so the
  // success bucket reads cleanly (`kept_add_row=1` not folded into the
  // dropped buckets).
  const reasonEntries = Object.entries(proposedDropped?.byReason || {});
  const reasonsStr = reasonEntries.length === 0
    ? 'reason=none'
    : reasonEntries.map(([k, v]) => `${k}=${v}`).join(' ');
  const keptByKind = proposedKept?.byKind || {};
  const keptStr = Object.entries(keptByKind)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.replace(/^propose_/, 'kept_')}=${v}`)
    .join(' ');
  console.log('[prose] proposed_actions(2pass) shortlist=%d active_rows=%d kept=%d %s %s',
    sanitizedShortlist.length, activeRowNamesOpt.length, proposedKept?.total || 0,
    keptStr || 'kept=0', reasonsStr);
  if (topicLensFillTel) {
    console.log('[prose] topic_lens_projector_fill filled=%d matched=%d no_match=%d schools_with_pack=%d schools_without_pack=%d',
      topicLensFillTel.filled, topicLensFillTel.matched, topicLensFillTel.no_match,
      topicLensFillTel.schools_with_pack, topicLensFillTel.schools_without_pack);
  }

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
        // P6: surface validation issues to the rendering layer so the
        // bubble can hide unverifiable sources (parallels NanaPanel's
        // citationFailure check). Persisted to DB via parsed_answer so
        // historical messages also get the trust treatment.
        ...(validationIssues.length > 0 ? { validationIssues } : {}),
        // Slice 5-FU1 — Nana's "+ Add as row" proposals. Bubble UI reads
        // this from research_session_messages.parsed_answer.proposed_actions
        // (slice 5 wired). confirm_add_row RPC reconstructs the row from
        // this same JSON, so it must already be schema-clean.
        ...(proposedActions ? { proposed_actions: proposedActions } : {}),
      },
      raw:               raw,                    // full original (with meta comment) for audit
      parseError:        null,
      validationIssues,
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
