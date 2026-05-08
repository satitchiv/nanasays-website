/**
 * agentic-loop.js
 *
 * Multi-turn orchestration that gives Claude a toolbox and lets her pick
 * which tool(s) to call before producing the final answer. Each turn:
 *
 *   1. Claude responds with JSON (sniff-streamed — see Streaming note)
 *   2. JS parses: tool_call or final_answer?
 *   3. tool_call → execute via tools.js → feed result into next turn's context
 *   4. final_answer → emit as the brain's `final` event
 *   5. capped at MAX_TURNS to prevent runaway
 *
 * The Claude CLI subprocess in --print mode does not support native tool_use
 * blocks, so we implement the loop in JS using a JSON convention. Same shape
 * as a manual ReAct loop.
 *
 * Streaming note: every Claude call (main turn, parse-error retry, force-
 * final fallback) goes through `streamCallWithSniff`. We buffer the prefix
 * until an anchored regex confirms the response is a final_answer at the
 * top level, then replay the buffered prefix and stream subsequent chunks
 * as {type:'token'} events. tool_call envelopes stay silent. Anchoring is
 * top-level only (regex against `^{"type":"final_answer"` etc.) so nested
 * JSON inside tool_call args can never false-positive trigger streaming.
 * If a parse-error retry has to run after tokens were already emitted, we
 * yield {type:'stream_reset'} first so the frontend can clear its buffer.
 * Frontend extracts partial fields (short_answer, tradeoff, ...) from the
 * running streamBuf via extractStreamingField in DecisionHub.tsx.
 */

import { TOOLS, TOOL_DESCRIPTIONS } from './tools.js';
import { suggestDimensions, listDimensions } from './dimensions.js';
import { injectToolResult } from './tool-result-compact.js';
import { buildPackContextString, shouldInjectPack, logPackTelemetry } from './pack-prompt-injection.js';

const MAX_TURNS = 4;

// ── Streaming-with-sniff helper ───────────────────────────────────────────
// Wraps a Claude streaming call. Buffers the prefix; once an anchored regex
// confirms the response is a top-level final_answer, replays the buffered
// prefix and streams subsequent chunks as {type:'token'} events. tool_call
// envelopes stay silent. Anchored detection prevents nested JSON inside
// tool_call args from ever false-positive triggering streaming mode.
//
// Returns (via async-generator return value, captured by `yield*` callers):
//   { raw, tokensEmitted, streamMode }
async function* streamCallWithSniff({
  callClaude, systemPrompt, parentContext, userMessage, reminder, ctx, signal,
  emitWritingStatus = false,
}) {
  let raw         = '';
  let prefixBuf   = '';
  let streamMode  = 'pending';                  // 'pending' | 'streaming' | 'silent'
  let tokensEmitted = false;

  const decideStreamMode = () => {
    // Strip a stray ```json fence (model is told not to emit one but
    // sometimes does), then collapse whitespace so the anchored regexes
    // don't break on indented JSON.
    const probe = prefixBuf
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s+/g, '');
    if (/^\{"type":"tool_call"/.test(probe))    return 'silent';
    if (/^\{"type":"final_answer"/.test(probe)) return 'streaming';
    if (/^\{"sections":\{/.test(probe))         return 'streaming';
    // Bound the buffer; default to silent on weird/malformed prefixes.
    if (probe.length > 400)                     return 'silent';
    return 'pending';
  };

  for await (const chunk of callClaude(systemPrompt, parentContext || null, userMessage, reminder, ctx, signal)) {
    raw += chunk;
    if (streamMode === 'streaming') {
      yield { type: 'token', text: chunk };
      tokensEmitted = true;
      continue;
    }
    if (streamMode === 'silent') continue;

    prefixBuf += chunk;
    streamMode = decideStreamMode();
    if (streamMode === 'streaming') {
      if (emitWritingStatus) yield { type: 'agent_status', message: 'Writing the answer…' };
      yield { type: 'token', text: prefixBuf };
      tokensEmitted = true;
      prefixBuf = '';
    } else if (streamMode === 'silent') {
      prefixBuf = '';
    }
  }
  return { raw, tokensEmitted, streamMode };
}

function buildSystemPrompt({ verbosity = 'chat' } = {}) {
  const toolDocs = Object.entries(TOOL_DESCRIPTIONS).map(([name, t]) => {
    const argsLine = Object.entries(t.args).map(([k, v]) => `${k}: ${v}`).join('; ');
    return `  ${name}\n    description: ${t.description}\n    args: ${argsLine}`;
  }).join('\n');

  const dimensionDocs = listDimensions().map(d => `  ${d.name}: ${d.description}`).join('\n');

  // Two schema shapes: chat (compact, optional sections may be omitted) and
  // report (full, fixed scaffolding). Picking the right one at prompt build
  // time saves the model 500-1500 output tokens per chat answer — the single
  // largest perceived-speed lever in the system.
  const finalAnswerSchema = verbosity === 'chat'
    ? `2) Final answer (when you have enough data) — CHAT MODE, keep it tight:
{ "type": "final_answer",
  "sections": {
    "short_answer":       "(REQUIRED) 1-3 sentences for normal questions. For 'top N' / 'list N' questions: a NUMBERED LIST of all N items, ONE PER LINE separated by literal \\\\n (newline) characters in the JSON string. Each entry: 'N. School Name (score) — fact1, fact2.' Top 1-2 may have a longer 1-2 sentence detail; entries 3+ stay one short line each. NEVER squash the list into a single paragraph; the renderer relies on \\\\n to break entries onto their own lines.",
    "tradeoff":           "(OPTIONAL — omit the field entirely when nothing to flag) a genuine CONCERN or RISK the parent should weigh — never encouragement, reassurance, or good news. If your tradeoff text contains phrases like 'the good news is', 'don't worry', or 'plenty of options' — DELETE THE FIELD. The renderer surfaces this with a ⚠ icon, so reassurance here is misleading.",
    "what_we_dont_know":  "(OPTIONAL — omit the field entirely when no real gap) honest data gaps the parent should know about.",
    "you_might_also_ask": "(REQUIRED) exactly 3 follow-up questions a curious parent might ask next."
  },
  "sources_used": [{ "section_id": "", "section_label": "", "source_url": "<URL from a tool result>", "school_slug": "<slug whose claim this URL supports, OR null when the URL is genuinely cross-school>", "source_type": "" }],
  "confidence": "high" | "medium" | "low" | "none",
  "recommended_schools": [{ "slug": "<from tool result>", "name": "", "why": "", "concern": null }] | null,
  "comparison_table": null  // optional: include only for cross-school comparisons. Shape: { "title": "", "columns": [...], "rows": [[...]] }
}

CHAT VERBOSITY: optional sections must be OMITTED entirely (don't write "Nothing to flag here", "(empty)", or any placeholder — just leave the key out). The renderer handles missing sections cleanly. Padding burns tokens and slows the answer.`
    : `2) Final answer (when you have enough data):
{ "type": "final_answer",
  "sections": {
    "short_answer":       "1-3 sentences, lead with strongest fact, name the school.",
    "confirmed_facts":    "markdown bullet list, each fact attributed to a named school",
    "what_this_means":    "parent-facing interpretation, OR 'Nothing to flag here'",
    "tradeoff":           "genuine differences worth weighing, OR 'Nothing to flag here'",
    "what_we_dont_know":  "honest data gaps, OR 'Nothing to flag here'",
    "sources":            "markdown source pill list",
    "you_might_also_ask": "exactly 3 follow-up questions"
  },
  "evidence": { "facts": [], "interpretations": [], "tradeoffs": [], "unknowns": [] },
  "sources_used": [{ "section_id": "", "section_label": "", "source_url": "<URL from a tool result>", "school_slug": "<slug whose claim this URL supports, OR null when the URL is genuinely cross-school>", "source_type": "" }],
  "follow_ups": ["string","string","string"],
  "tour_question": null,
  "tour_target": null,
  "comparison_table": null,
  "confidence": "high" | "medium" | "low" | "none",
  "recommended_schools": [{ "slug": "<from tool result>", "name": "", "why": "", "concern": null }] | null
}`;

  return `You are Nana, an AI advisor for parents researching UK independent schools.

You have access to a toolbox that queries our database of 140 UK independent
schools. On each turn, you respond with JSON in EXACTLY one of these two shapes:

1) Tool call (when you need data):
{ "type": "tool_call", "name": "<tool_name>", "args": { ... } }

${finalAnswerSchema}

═══════════════════════════════════════════════════════════════════════
TOOLS
═══════════════════════════════════════════════════════════════════════
${toolDocs}

═══════════════════════════════════════════════════════════════════════
DIMENSIONS (for rankSchools / compareSchools)
═══════════════════════════════════════════════════════════════════════
${dimensionDocs}

═══════════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════════

1. PLAN BEFORE YOU ACT. Pick the right starting tool by question shape:
   - "strongest X" / "best X" → rankSchools FIRST, then getSchoolFacts on top 2-3 to enrich.
   - "X under £45k" / filter+rank → filterSchools FIRST, then rankSchools with restrict_to_slugs.
   - "compare these N schools on X" / shortlist comparison → compareSchools FIRST with the named slugs and the dimension(s) implied by X (tennis → tennis_strength, rugby → rugby_standing, academics → academic_strength, fees/value → fees_value, pastoral/culture → pastoral_model). Then getSchoolFacts on the top 1-2 schools or outliers most relevant to the answer.
   - "which of my N is best for X" → rankSchools with restrict_to_slugs=[shortlist slugs], then getSchoolFacts on the top result for context.
   - "red flags / safe / safeguarding / inspection concerns" → searchSafeguarding FIRST, then getSchoolFacts only if more context is needed.

   When calling getSchoolFacts, ALWAYS pass a "fields" array matching the question. For sports questions include "sports_profile" explicitly — it is NOT in the default. For academic questions, ["exam_results","university_destinations"]. For fees, ["fees_min","fees_max","fees_currency","fees_by_grade"]. Specify what you need; do not rely on the default.

2. ONLY USE FACTS FROM TOOL RESULTS. Never invent figures, win counts, or
   alumni names. If tools didn't return it, use what_we_dont_know.

3. CITATIONS — every claim must cite a source_url that appeared in a tool
   result. Don't invent URLs. Copy them character-for-character from the
   "citations" arrays in tool results. ALWAYS include the school_slug key in
   every sources_used entry — set it to the slug whose claim that URL
   supports (e.g. a Reed's-tennis URL must cite school_slug="reeds-school").
   Use school_slug=null ONLY for genuinely cross-school sources (e.g. a
   league table or fees-comparison page that covers multiple schools at
   once). Default to a real slug — null is the rare case.

4. NEVER call the same tool with the same args twice.

5. MAXIMUM 4 TURNS total. Each model response counts as one turn — including
   tool_calls AND any responses that get rejected (duplicate args, unknown
   tool, invalid JSON). Plan to use 1-3 turns for tool_calls and the LAST
   turn for final_answer. By turn 4, any tool_call you emit will be
   discarded — emit final_answer there with whatever data you have.

6. JSON ONLY. No prose outside the JSON envelope. No markdown code fences.

7. FOR NARRATIVE QUESTIONS ("what is the culture like at Eton?") — call
   searchSchoolText with the slug, not rankSchools.

8. recommended_schools — populate ONLY when the parent explicitly asks for
   recommendations ("which school is best for...", "find me schools that..."),
   AND only with slugs returned by your tool calls. Max 4 entries. Otherwise
   set to null.

9. STOP EARLY WHEN READY. After each tool result, ask: "Do I have enough to
   answer the parent's specific question?" If yes, emit final_answer. But
   don't stop mid-pattern: if the first tool only identified candidates,
   slugs, or scores and Rule 1 calls for enrichment, do the one useful
   follow-up first. The 4-turn cap is a ceiling, not a target.

10. TOP-N BUDGET. For "top N" / "recommend N schools" questions, scale your
    strategy to N. Pass limit=N to rankSchools (max 100), then:
    - N ≤ 3: enrich each with getSchoolFacts. Detailed paragraphs.
    - N = 4-10: enrich the top 2 with getSchoolFacts. Use rankSchools'
      built-in summary for the rest. Compact entries.
    - N = 11-30: use rankSchools alone. Don't enrich any. Render the list
      with short blurbs from rankSchools' summary field. Suggest parents
      click into a school for detail.
    - N > 30: tell the parent that 30+ rows is hard to read in chat and
      suggest visiting a dedicated rankings page. Still answer with the
      top 10 from rankSchools so the response isn't empty, but flag the
      better surface.
    Trying to enrich every recommended school for any N > 3 will exhaust
    the turn budget. Match the parent's N to your "limit" argument — don't
    default to 10 when they asked for 50.

    LIST FORMATTING — CRITICAL. Whenever you output a numbered list inside
    short_answer, separate items with literal \\n characters in the JSON
    string. Correct: "1. First school — fact.\\n2. Second school — fact."
    WRONG: "1. First school — fact. 2. Second school — fact." (squashed
    into one line). The renderer breaks on \\n; without them every list
    looks like a single paragraph and parents can't scan entries.

═══════════════════════════════════════════════════════════════════════
VOICE — sound like a trusted advisor, not a generic AI assistant
═══════════════════════════════════════════════════════════════════════

A. SPECIFICS, NEVER PLATITUDES. Numbers, names, dates. Never write
   "strong academic culture" — write "94% A*-A at A-level (2024)". If
   you can't name a fact, that's a data gap, not a sentence.

B. NO THROAT-CLEARING. Skip "I'd be happy to help", "Great question",
   "As an AI assistant", "Let me explain", "It's important to note".
   Just answer.

C. ON UNCERTAINTY, NAME THE GAP + REDIRECT. Never just "I don't have
   that information". Pattern: "[X] isn't in my dataset, but [Y] does
   show [fact]." If nothing relevant exists, name the data class missing
   and suggest a tour question.
   GOOD: "ISI inspection details aren't in my dataset, but the 2023
   exam results show 78% A*-A — want to dig into those?"
   BAD: "I don't have specific information about that."

D. HEDGE WITH REASONS. When flagging a tradeoff, attach a "because" —
   never "it's worth noting" alone.
   GOOD: "Pastoral ratings are strong because every house has a
   dedicated wellbeing officer."
   BAD: "It's worth noting that pastoral care is well-rated."

E. NAME THE FIT, not just the school. When the data supports it, frame
   what kind of student/family belongs here ("this suits ambitious,
   self-directed kids who thrive on competition") rather than listing
   qualities ("this is a strong academic school"). HARD GUARDRAIL:
   make a fit claim only when you can name the specific data point
   supporting it in the same answer. Otherwise describe what the data
   suggests, not which child belongs there. exam_results alone supports
   "academically demanding/selective" — NOT "self-directed". Personality
   claims need pastoral or culture data, not exam scores.

F. BRITISH UNDERSTATEMENT. No "amazing", "incredible", "wonderful",
   "outstanding" (unless quoting an ISI/Ofsted inspection grade like
   "ISI Outstanding"). UK independent-school parents read effusive
   language as marketing voice. Reserved, factual, specific.

═══════════════════════════════════════════════════════════════════════`;
}

// Precomputed once per process — both verbosities are static text after the
// dimensions & tool docs are baked in. Pick at request time based on opts.
const AGENTIC_SYSTEM_PROMPT_CHAT   = buildSystemPrompt({ verbosity: 'chat' });
const AGENTIC_SYSTEM_PROMPT_REPORT = buildSystemPrompt({ verbosity: 'report' });

// ── Shortlist-lock enforcement ────────────────────────────────────────────
// When opts.restrictToSlugs is set, the loop runs in "shortlist-locked mode."
// Tool args are normalized server-side BEFORE dispatch so the model can never
// reach data outside the locked set, even if the prompt fails to constrain it.
// Codex review: prompt instructions are not sufficient — server enforcement is.
function enforceShortlistLock(toolName, args, lockedSet, lockedArr) {
  const isInSet  = (s) => typeof s === 'string' && lockedSet.has(s);
  const intersect = (arr) => Array.isArray(arr) ? arr.filter(isInSet) : [];

  switch (toolName) {
    case 'rankSchools':
      // Auto-fill restrict_to_slugs even if Claude omitted it.
      return { reject: false, args: { ...args, restrict_to_slugs: lockedArr } };

    case 'compareSchools': {
      const requested = Array.isArray(args.slugs) ? args.slugs : [];
      const filtered  = requested.length ? intersect(requested) : lockedArr.slice();
      if (filtered.length === 0) {
        return {
          reject: true,
          reason: `compareSchools: none of the requested slugs are in the shortlist ${JSON.stringify(lockedArr)}. Retry with slugs from the shortlist, or emit final_answer.`,
        };
      }
      return { reject: false, args: { ...args, slugs: filtered } };
    }

    case 'getSchoolFacts':
      if (!isInSet(args.slug)) {
        return {
          reject: true,
          reason: `getSchoolFacts: slug "${args.slug ?? '(none)'}" is not in the shortlist ${JSON.stringify(lockedArr)}. Retry with a slug from the shortlist.`,
        };
      }
      return { reject: false, args };

    case 'searchSchoolText':
      if (!isInSet(args.slug)) {
        return {
          reject: true,
          reason: `searchSchoolText: in shortlist-locked mode, slug is REQUIRED and MUST be one of ${JSON.stringify(lockedArr)}. Retry with a locked slug.`,
        };
      }
      return { reject: false, args };

    case 'searchSafeguarding':
      // slug is optional on this tool; only validate when provided.
      if (args.slug != null && !isInSet(args.slug)) {
        return {
          reject: true,
          reason: `searchSafeguarding: slug "${args.slug}" not in shortlist ${JSON.stringify(lockedArr)}. Retry with a locked slug, or omit slug to query the whole locked set.`,
        };
      }
      return { reject: false, args };

    case 'filterSchools':
      // Pass through; result is post-filtered to the locked set after dispatch.
      return { reject: false, args };

    default:
      return { reject: false, args };
  }
}

function postFilterFilterSchoolsResult(toolResult, lockedSet) {
  const inside = (toolResult?.result?.schools || []).filter(s => lockedSet.has(s.slug));
  return {
    ...toolResult,
    result:  { ...(toolResult.result || {}), count: inside.length, schools: inside },
    summary: `${toolResult.summary || ''} (post-filtered to shortlist: ${inside.length})`.trim(),
  };
}

/**
 * The main loop. Async generator that yields:
 *   { type: 'agent_status', message: '...' }
 *   { type: 'tool_call', name, args, status: 'started' | 'completed', result_summary? }
 *   { type: 'token', text: '...' }                     (final-answer turns only)
 *   { type: 'stream_reset' }                            (clears partial token buf before retry)
 *   { type: 'retrieval', payload: { agentic: true, citations: [...] } }
 *   { type: 'final', payload: { parsed, raw, agenticTurns, agenticCitations, ... } }
 *   { type: 'error', error, code }
 *
 * deps:
 *   callClaude:  the streaming wrapper (callClaudeStream from nana-brain.js)
 *   parseJson:   JSON parser (parseClaudeJson from nana-brain.js)
 *   sanitize:    sections sanitizer (sanitizeSections from nana-brain.js)
 *
 * opts:
 *   signal:           AbortSignal
 *   parentContext:    string injected into Claude's system context
 *   restrictToSlugs:  string[] — when set, enables shortlist-locked mode.
 *                     Tool args are auto-normalized to stay within the set,
 *                     and out-of-set tool calls are rejected with a system
 *                     note rather than executed.
 */
export async function* runAgenticLoop({
  callClaude,
  parseJson,
  sanitize,
  supabase,
  question,
  opts = {},
}) {
  const signal         = opts.signal || null;
  let   parentContext  = opts.parentContext || null;
  const t0             = Date.now();

  // P2: Research Context Pack — additive context.
  // Appends pack-derived prose to parentContext when opts.pack is present.
  // When opts.pack is null/undefined (NANA_PACK_V1 OFF) this is a no-op.
  if (shouldInjectPack(opts.pack)) {
    const packStr = buildPackContextString(opts.pack);
    if (packStr) {
      parentContext = parentContext ? `${parentContext}\n${packStr}` : packStr;
      logPackTelemetry('agenticLoop', opts.pack);
    }
  }

  // Shortlist-locked mode setup
  const restrictToSlugs = Array.isArray(opts.restrictToSlugs)
    ? opts.restrictToSlugs.filter(s => typeof s === 'string' && s.length > 0).slice(0, 4)
    : null;
  const isLocked  = Array.isArray(restrictToSlugs) && restrictToSlugs.length >= 2;
  const lockedSet = isLocked ? new Set(restrictToSlugs) : null;

  // Verbosity: 'chat' (default — compact, optional sections may be omitted)
  // vs 'report' (full schema with all 7 sections required). Chat shaves
  // 500-1500 output tokens per answer.
  const verbosity = opts.verbosity === 'report' ? 'report' : 'chat';
  const SYSTEM_PROMPT = verbosity === 'report'
    ? AGENTIC_SYSTEM_PROMPT_REPORT
    : AGENTIC_SYSTEM_PROMPT_CHAT;

  const suggested = suggestDimensions(question);
  const dimensionHint = suggested.length
    ? `\n(Hint: dimensions matching this question: ${suggested.join(', ')}.)`
    : '';

  // Lock-aware addendum — only emitted when shortlist-locked mode is active.
  // Server-side dispatcher enforcement is the source of truth; this is a
  // belt-and-braces hint so Claude composes tool calls correctly the first time.
  const lockNote = isLocked
    ? `\n\nSHORTLIST-LOCKED MODE: Parent has chosen these ${restrictToSlugs.length} schools to deep-dive on: ${restrictToSlugs.join(', ')}.\n` +
      `ALL tool calls MUST stay within this set:\n` +
      `- rankSchools: pass restrict_to_slugs=${JSON.stringify(restrictToSlugs)}.\n` +
      `- compareSchools: only use slugs from this set.\n` +
      `- getSchoolFacts: slug must be from this set.\n` +
      `- searchSchoolText: slug REQUIRED, must be from this set.\n` +
      `- searchSafeguarding: slug (if provided) must be from this set.\n` +
      `- DO NOT recommend or mention schools outside this set in final_answer.`
    : '';

  // Conversation history fed back to Claude on each turn.
  const messages = [
    `PARENT QUESTION: ${question}${dimensionHint}${lockNote}\n\nReturn JSON only — either a tool_call or a final_answer.`,
  ];

  // Progress event so the UI can render an honest expectation while Claude
  // plans the first turn (prevents the silent 5-8s before the first tool_call).
  if (isLocked) {
    yield {
      type: 'agent_status',
      message: `Planning the checks for your ${restrictToSlugs.length}-school shortlist…`,
    };
  }

  // Citations are tracked with provenance ({slug, tool, dimension}) so
  // validateAnswer can detect citation/claim-school mismatches. Same URL
  // surfaced from multiple tools merges into one entry with the union of
  // slugs/tools/dimensions seen. Backward-compat flat URL list is computed
  // on demand at yield time.
  const citationProvenance = new Map(); // url → { url, slugs:Set, tools:Set, dimensions:Set }
  const seenToolCalls   = new Set();   // dedup signature
  let parsed            = null;
  let lastRaw           = '';
  let turn              = 0;
  let claudeMs          = 0;
  let unproductiveTurns = 0;            // turns that didn't yield a tool result or final answer

  // Accumulate token usage across every turn (main, JSON-retry, force-final)
  // so the final payload — and downstream nana_chat_logs / Costs dashboard —
  // reflects the full cost of the agentic loop, not just the last turn.
  const usageAcc = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let usageModel = null;
  const addUsage = (ctx) => {
    if (!ctx?.usage) return;
    const u = ctx.usage;
    usageAcc.input_tokens                += u.input_tokens                ?? 0;
    usageAcc.output_tokens               += u.output_tokens               ?? 0;
    usageAcc.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
    usageAcc.cache_read_input_tokens     += u.cache_read_input_tokens     ?? 0;
    if (!usageModel && ctx.model) usageModel = ctx.model;
  };

  // Canonical args signature — stable across key-order variations so duplicate
  // detection isn't fooled by Claude shuffling argument keys.
  const sigOf = (toolName, args) => {
    const sorted = Object.keys(args || {}).sort().reduce((acc, k) => { acc[k] = args[k]; return acc; }, {});
    return `${toolName}:${JSON.stringify(sorted)}`;
  };

  for (turn = 1; turn <= MAX_TURNS; turn++) {
    if (signal?.aborted) return;

    const userMessage = messages.join('\n\n═══════════════════════════════════════════════════════════════════════\n\n');
    // Last-turn nudge — appended as the retryReminder slot so the model sees
    // it inline. Reduces (but does not eliminate) the need for force-final.
    const lastTurnReminder = turn === MAX_TURNS
      ? '\n\nLAST ALLOWED TURN: emit final_answer NOW using whatever data you already have. Do NOT emit a tool_call — it will fail.'
      : '';
    let raw = '';
    const ctx = {};
    const turnStart = Date.now();
    let tokensEmittedThisTurn = false;

    try {
      const result = yield* streamCallWithSniff({
        callClaude, systemPrompt: SYSTEM_PROMPT, parentContext, userMessage,
        reminder: lastTurnReminder, ctx, signal,
        emitWritingStatus: true,
      });
      raw = result.raw;
      tokensEmittedThisTurn = result.tokensEmitted;
    } catch (e) {
      if (signal?.aborted) return;
      yield { type: 'error', error: `agentic loop turn ${turn}: ${e.message}`, code: 'claude_error' };
      return;
    }
    addUsage(ctx);

    claudeMs += (Date.now() - turnStart);
    lastRaw = raw;

    let action;
    try {
      action = parseJson(raw);
    } catch (e) {
      // Retry once with a JSON-only reminder appended. If the original turn
      // already streamed tokens (e.g. mid-string truncation), tell the
      // frontend to clear its buffer first so stale partial text doesn't
      // sit on screen while the retry runs.
      if (tokensEmittedThisTurn) {
        yield { type: 'stream_reset' };
      }
      const reminder = '\n\nIMPORTANT: your previous response was not valid JSON. Respond ONLY with JSON — either { "type": "tool_call", ... } or { "type": "final_answer", ... }. No code fences. No prose.';
      let retryRaw = '';
      const retryCtx = {};
      try {
        const retryResult = yield* streamCallWithSniff({
          callClaude, systemPrompt: SYSTEM_PROMPT, parentContext, userMessage,
          reminder, ctx: retryCtx, signal,
          emitWritingStatus: true,
        });
        retryRaw = retryResult.raw;
        action  = parseJson(retryRaw);
        raw     = retryRaw;
        lastRaw = retryRaw;
      } catch (e2) {
        addUsage(retryCtx);
        yield { type: 'error', error: `agentic loop turn ${turn}: invalid JSON after retry — ${e2.message}`, code: 'parse_error' };
        return;
      }
      addUsage(retryCtx);
    }

    if (!action || typeof action !== 'object') {
      yield { type: 'error', error: `agentic loop turn ${turn}: empty action`, code: 'parse_error' };
      return;
    }

    // Detect final_answer — accept several shapes Claude might produce
    const isFinal =
      action.type === 'final_answer' ||
      action.action === 'final_answer' ||
      (!action.type && !action.action && action.sections && typeof action.sections === 'object');

    if (isFinal) {
      // Strip the wrapper if present
      parsed = action.payload || action.answer || action;
      if (parsed === action) {
        parsed = { ...action };
        delete parsed.type;
        delete parsed.action;
      }
      if (sanitize) parsed = sanitize(parsed);
      break;
    }

    // Tool call branch
    const toolName = action.name || action.tool;
    const toolArgs = action.args || action.arguments || {};

    if (!toolName || !TOOLS[toolName]) {
      messages.push(`SYSTEM ERROR: unknown tool "${toolName}". Valid tools: ${Object.keys(TOOLS).join(', ')}. Try again or emit final_answer.`);
      unproductiveTurns++;
      if (unproductiveTurns >= 2) {
        yield { type: 'error', error: `agentic loop stuck: ${unproductiveTurns} unproductive turns`, code: 'agent_stuck' };
        return;
      }
      continue;
    }

    // Shortlist-lock enforcement — runs BEFORE dedup and dispatch. If the
    // requested call is unsafe in locked mode, feed a system error back into
    // the loop and let Claude retry without consuming a productive turn.
    let effectiveArgs = toolArgs;
    if (isLocked) {
      const enforced = enforceShortlistLock(toolName, toolArgs, lockedSet, restrictToSlugs);
      if (enforced.reject) {
        messages.push(`SYSTEM ERROR: ${enforced.reason}`);
        unproductiveTurns++;
        if (unproductiveTurns >= 2) {
          yield { type: 'error', error: `agentic loop stuck: ${unproductiveTurns} unproductive turns (shortlist-lock rejections)`, code: 'agent_stuck' };
          return;
        }
        continue;
      }
      effectiveArgs = enforced.args;
    }

    const sig = sigOf(toolName, effectiveArgs);
    if (seenToolCalls.has(sig)) {
      messages.push(`SYSTEM NOTE: you already called ${toolName} with these exact args. Don't repeat tool calls — emit final_answer using the data you already have.`);
      unproductiveTurns++;
      if (unproductiveTurns >= 2) {
        yield { type: 'error', error: `agentic loop stuck: ${unproductiveTurns} unproductive turns`, code: 'agent_stuck' };
        return;
      }
      continue;
    }
    seenToolCalls.add(sig);
    unproductiveTurns = 0;  // productive call; reset

    yield { type: 'tool_call', name: toolName, args: effectiveArgs, status: 'started' };

    let toolResult;
    try {
      toolResult = await TOOLS[toolName](supabase, effectiveArgs);
    } catch (e) {
      yield { type: 'error', error: `agentic loop turn ${turn}: tool ${toolName} threw — ${e.message}`, code: 'tool_error' };
      return;
    }

    // filterSchools doesn't accept a slug-restrict arg today; post-filter the
    // returned slug list to the locked set so the loop never sees outsiders.
    if (isLocked && toolName === 'filterSchools') {
      toolResult = postFilterFilterSchoolsResult(toolResult, lockedSet);
    }

    yield {
      type: 'tool_call',
      name: toolName,
      args: effectiveArgs,
      status: 'completed',
      result_summary: toolResult.summary,
    };

    for (const c of toolResult.citations || []) {
      if (!c?.url) continue;
      let prov = citationProvenance.get(c.url);
      if (!prov) {
        prov = { url: c.url, slugs: new Set(), tools: new Set(), dimensions: new Set() };
        citationProvenance.set(c.url, prov);
      }
      if (c.slug)      prov.slugs.add(c.slug);
      if (c.tool)      prov.tools.add(c.tool);
      if (c.dimension) prov.dimensions.add(c.dimension);
    }

    // Compact the tool result before injection. The old `JSON.stringify(..., null, 2)`
    // path could push 25KB of `sports_profile` per call into the next turn —
    // by turn 3-4 the context was 50-100KB of decoration. injectToolResult
    // drops that ~80% with a structured plain-text rendering and a 4KB hard
    // cap as last-resort guard against future tools we haven't projected.
    messages.push(
      `TOOL RESULT [${toolName}]:\n${injectToolResult(toolName, toolResult.result)}\n\nDecide your next action. JSON only.`
    );
  }

  // ── Force-final fallback ───────────────────────────────────────────────
  // The loop exited without a parsed answer — the model burned every turn on
  // tool_calls and never emitted final_answer. Rather than dropping the user
  // into an error toast after 4 turns of work, do one more deterministic call
  // where tool_calls are explicitly forbidden. This converts a broken UX into
  // a best-effort answer using whatever data is already in `messages`.
  let forcedFinal = false;
  if (!parsed) {
    if (signal?.aborted) return;
    yield { type: 'agent_status', message: 'Writing the answer with what I have…' };

    const forceTranscript = messages.join('\n\n═══════════════════════════════════════════════════════════════════════\n\n');
    const forceReminder   =
      '\n\nFINAL TURN: you have exceeded the tool-call budget. Emit ONLY a final_answer JSON now using the data already gathered. ' +
      'If data is sparse, use what_we_dont_know to be honest about gaps. Do NOT emit a tool_call — that response will be discarded.';
    const forceStart = Date.now();
    let   forceRaw   = '';
    try {
      // Sniff-stream rather than blind-stream: the reminder *asks* for a
      // final_answer but the model can disobey. If it does, we'd rather
      // stay silent than leak a tool_call envelope into the UI.
      // emitWritingStatus=false because the caller already yielded
      // "Writing the answer with what I have…" above.
      const forceCtx = {};
      const forceResult = yield* streamCallWithSniff({
        callClaude, systemPrompt: SYSTEM_PROMPT, parentContext,
        userMessage: forceTranscript, reminder: forceReminder, ctx: forceCtx, signal,
        emitWritingStatus: false,
      });
      forceRaw = forceResult.raw;
      addUsage(forceCtx);
    } catch (e) {
      if (signal?.aborted) return;
      // Force-final itself failed — fall through to the original error event.
    }
    claudeMs += (Date.now() - forceStart);
    lastRaw = forceRaw || lastRaw;

    if (forceRaw) {
      try {
        const forced = parseJson(forceRaw);
        const isFinalForced =
          forced?.type === 'final_answer' ||
          forced?.action === 'final_answer' ||
          (!forced?.type && !forced?.action && forced?.sections && typeof forced.sections === 'object');
        if (isFinalForced) {
          parsed = forced.payload || forced.answer || forced;
          if (parsed === forced) { parsed = { ...forced }; delete parsed.type; delete parsed.action; }
          if (sanitize) parsed = sanitize(parsed);
          forcedFinal = true;
        }
      } catch (_) {
        // parse failed — leave parsed null and fall through to the error event below
      }
    }
  }

  if (!parsed) {
    yield {
      type: 'error',
      error: `agentic loop exhausted ${MAX_TURNS} turns without final_answer (force-final fallback also failed)`,
      code: 'agent_max_turns',
    };
    return;
  }

  // Last guard: drop any recommended_schools entries outside the locked set.
  // Belt-and-braces — the dispatcher should have prevented out-of-set slugs
  // appearing in tool results, but Claude can still hallucinate slugs in the
  // final_answer payload.
  if (isLocked && Array.isArray(parsed?.recommended_schools)) {
    parsed.recommended_schools = parsed.recommended_schools.filter(
      r => r && typeof r.slug === 'string' && lockedSet.has(r.slug),
    );
  }

  if (isLocked) {
    yield { type: 'agent_status', message: 'Writing the comparison…' };
  }

  // Serialize provenance for the final payload. Sets become arrays so the
  // payload is JSON-safe (it ends up in nana_chat_logs). Flat URL list is
  // also exposed so consumers that don't speak provenance keep working.
  const provenanceList = [...citationProvenance.values()].map(p => ({
    url:        p.url,
    slugs:      [...p.slugs],
    tools:      [...p.tools],
    dimensions: [...p.dimensions],
  }));
  const flatUrls = [...citationProvenance.keys()];

  // Compatibility event for existing UI consumers (mirrors runGlobalQuestionStream).
  // Citations stay as flat URL strings here — backward compat for eval-shortlist-
  // agentic.js and any frontend consumers iterating retrieval.citations as URLs.
  yield {
    type: 'retrieval',
    payload: {
      schools: [],
      agentic: true,
      citations: flatUrls,
    },
  };

  yield {
    type: 'final',
    payload: {
      parsed,
      raw: lastRaw,
      validationIssues: [],
      claudeMs,
      totalMs: Date.now() - t0,
      // Aggregated across every Claude call in this loop (main turns +
      // JSON-retry + force-final). null when no calls populated ctx.usage —
      // e.g. CLI backend or every call failed before usage events arrived.
      usage: usageAcc.input_tokens || usageAcc.output_tokens ? usageAcc : null,
      usageModel,
      cost: null, // computed by runAgenticQuestionStream wrapper which has computeCostUSD
      agenticTurns:    forcedFinal ? turn - 1 : turn,
      forcedFinal,
      // Structured shape consumed by runAgenticQuestionStream to build the
      // citationProvenance Map passed into validateAnswer for slug-match.
      agenticCitations: provenanceList,
      shortlistLocked: isLocked,
      restrictToSlugs:  isLocked ? [...restrictToSlugs] : null,
    },
  };
}
