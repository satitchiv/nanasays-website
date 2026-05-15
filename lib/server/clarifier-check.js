/**
 * clarifier-check.js (sketch v3)
 *
 * Junk-input clarifier guard. Runs at the route boundary BEFORE retrieval /
 * generation / pack assembly. If the question is obvious gibberish, returns
 * a structured verdict the route uses to short-circuit with a canned
 * "could you rephrase?" SSE final event.
 *
 * Hybrid two-stage design (per Codex 2026-05-15 design review + r1/r2 fixes):
 *   Stage 1 (always on):  cheap deterministic heuristics. Catches obvious
 *                         keyboard-mash, punctuation-only, repeated-char,
 *                         no-letters questions in <1ms with zero network
 *                         cost. UK schools shorthand (`11+?`, `13+?`,
 *                         `£42k pa?`) is STRIPPED from the question and
 *                         the residual is run back through the heuristics
 *                         (v3) so allowlist tokens can't mask surrounding
 *                         junk like `asdf 11+`. ~99% of well-formed
 *                         questions sail through with a clean ALLOW.
 *   Stage 2 (opt-in):     LLM classifier for the AMBIGUOUS bucket — short
 *                         questions that pass Stage 1 but might still be
 *                         meaningless ("schools", "hello there friend").
 *                         Gated behind NANA_CLARIFIER_LLM=on; default OFF
 *                         in v1 so we don't add latency to the happy path
 *                         until we have a smoke baseline. Skipped when
 *                         hasUsableHistory=true AND the question is a
 *                         continuation stub ("more?", "details?").
 *
 * Both stages are gated behind NANA_CLARIFIER=on (master flag) so the
 * whole feature can be killed by flipping a single env var. Default is
 * OFF — the route path is identical to today's behaviour when the flag
 * is unset.
 *
 * Failure mode: any unexpected error (LLM timeout, JSON parse, etc.)
 * fails OPEN — we return needsClarification=false. Better to risk one
 * fabricated answer than block a real parent.
 *
 * Codex r2 changes from v2:
 *   P2 — strip-and-recheck allowlist (instead of allowlist short-circuit)
 *      + KEYBOARD_RUN_MIN lowered 5 → 4 so 4-char mashes get caught
 *      + bare 2-char `ok` removed from CONTINUATION_STUB_RE (too_short
 *        fires first anyway)
 *   NIT — `shareToken` field omitted from clarifier final events rather
 *         than sent as null (matches client `string | undefined` types)
 *
 * Used by:
 *   - app/api/nana-research/route.ts  (Research Mode)
 *   - app/api/nana-parent-chatbot/[slug]/route.ts  (NanaPanel on report)
 */

import OpenAI from 'openai';

// ── Tunables ────────────────────────────────────────────────────────────────

const MIN_LENGTH        = 3;
const MIN_ALPHA_RATIO   = 0.3;
const MAX_REPEAT_RATIO  = 0.7;
const KEYBOARD_RUN_MIN  = 4;     // v3: lowered 5→4 to catch `asdf`/`qwer` mashes after strip
const STAGE_2_LENGTH_CEILING = 20;
const STAGE_2_TIMEOUT_MS = 2000;
const STAGE_2_MODEL_ENV  = 'NANA_CLARIFIER_MODEL';
const STAGE_2_MODEL_DEFAULT = 'gpt-4o-mini';

// Canned response. Plain English, advisor voice, no AI-y "I'm sorry but…".
const CLARIFY_MESSAGE = "I didn't quite catch that — could you rephrase your question? You can ask about fees, academics, pastoral care, sports, admissions, or anything else from the school's published profile.";

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// UK independent-schools shorthand parents naturally type. v3 changes:
// these tokens are STRIPPED from the question before heuristics run, then
// the residual is re-checked. So:
//   - "11+?" strips to "?", residual short → ALLOW
//   - "Eton 11+?" strips to "Eton ?", residual passes heuristics → ALLOW
//   - "asdf 11+" strips to "asdf", residual is keyboard mash → CLARIFY
//   - "@@@@ GCSE" strips to "@@@@", residual no_letters → CLARIFY
const UK_SHORTHAND_PATTERNS = [
  /\b\d{1,2}\s*\+/g,                                          // entry age: 11+, 13+, 16+
  /£\s*[\d,]+(?:\.\d+)?\s*k?/g,                               // £-prefixed figures incl. £14,200
  /\b\d+\s*k\b/g,                                              // bare "42k"
  /\b(pa|p\.a\.|p\/a|\/yr|\/year|per\s*term|per\s*year)\b/gi,  // fee suffixes
  /\b(gcse|igcse|btec|ib|isi|ofsted|ucas|coa|prep|sixth\s*form|a[\s-]?level|a\*|11\s*plus|13\s*plus)\b/gi, // common acronyms
];

// Continuation-stub patterns that are ambiguous on a cold start but valid
// mid-conversation. Stage 2 (LLM) gets skipped for these when ctx.hasUsableHistory
// is true. v3: bare `ok` removed (too_short fires first since len 2 < MIN_LENGTH 3).
const CONTINUATION_STUB_RE = /^(more|details|expand|continue|tell me more|go on|another|next|why|how|and\??|yes\??|sure)\??$/i;

// ── Stage 1: deterministic heuristics ──────────────────────────────────────

// Strip-and-recheck (v3): remove all UK shorthand tokens from the question,
// then re-run junk checks on what's left. If the residual is too short to
// be meaningful (< MIN_LENGTH), treat as ALLOW (the entire question was
// shorthand). If the residual is real text, classify it. If the residual
// is junk (mash/repeated/no-letters), CLARIFY.
//
// Returns the same string-or-null shape as the inner heuristic.
function reasonForJunk(question) {
  const q = String(question || '').trim();
  if (q.length < MIN_LENGTH) return 'too_short';

  // Strip allowlisted shorthand tokens, then collapse whitespace.
  let stripped = q;
  for (const re of UK_SHORTHAND_PATTERNS) stripped = stripped.replace(re, ' ');
  stripped = stripped.replace(/\s+/g, ' ').trim();

  // Pure shorthand (or near-pure): allow without further checks. The original
  // question had real allowlisted content, residual is empty/negligible —
  // unlikely to be junk in disguise.
  if (stripped.length < MIN_LENGTH) return null;

  return classifyResidual(stripped);
}

// Heuristic classification of the post-strip residual. Same rules as before;
// just factored out so reasonForJunk can call it on the stripped string.
function classifyResidual(text) {
  const noWhitespace = text.replace(/\s+/g, '');
  const alphaCount   = (noWhitespace.match(/\p{L}/gu) || []).length;
  if (alphaCount === 0) return 'no_letters';

  const alphaRatio = alphaCount / noWhitespace.length;
  if (alphaRatio < MIN_ALPHA_RATIO) return 'low_alpha_ratio';

  const alphanumOnly = noWhitespace.replace(/[^\p{L}\p{N}]/gu, '');
  if (alphanumOnly.length >= 4) {
    const counts = new Map();
    for (const ch of alphanumOnly.toLowerCase()) counts.set(ch, (counts.get(ch) || 0) + 1);
    const maxCount = Math.max(...counts.values());
    if (maxCount / alphanumOnly.length > MAX_REPEAT_RATIO) return 'repeated_chars';
  }

  const lowerAlpha = noWhitespace.toLowerCase().replace(/[^a-z]/g, '');
  for (const row of KEYBOARD_ROWS) {
    const reversed = row.split('').reverse().join('');
    for (let i = 0; i + KEYBOARD_RUN_MIN <= row.length; i++) {
      if (lowerAlpha.includes(row.slice(i, i + KEYBOARD_RUN_MIN)))      return 'keyboard_mash';
      if (lowerAlpha.includes(reversed.slice(i, i + KEYBOARD_RUN_MIN))) return 'keyboard_mash';
    }
  }

  return null;
}

// ── Stage 2: LLM ambiguity check (opt-in) ─────────────────────────────────

let _openaiClient = null;
function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  _openaiClient = new OpenAI({ apiKey });
  return _openaiClient;
}

const STAGE_2_SYSTEM_PROMPT = `You are a content moderator for a UK independent-schools chatbot. Decide whether the user's question is ANSWERABLE about UK independent schools, or if it's gibberish, off-topic chatter, or so vague it would lead to a fabricated answer.

ANSWERABLE examples:
- "What are Eton's fees?" → answerable
- "Best CofE schools" → answerable
- "fees?" → answerable (short but on-topic)
- "tell me about pastoral care" → answerable
- "is harrow good for shy boys" → answerable

NOT ANSWERABLE examples:
- "asdfghjkl ???" → not answerable (keyboard mash)
- "hello there friend" → not answerable (chitchat, no school question)
- "schools" → not answerable (too vague to ground without inventing)
- "how about you?" → not answerable (chitchat)

Reply with strict JSON only: {"answerable": true} or {"answerable": false}. No prose, no code fences, no explanation.`;

/**
 * runStage2(question, signal, clientOverride)
 *
 * @param {string} question
 * @param {AbortSignal|null} signal
 * @param {OpenAI|null} clientOverride — test injection; bypasses getOpenAIClient
 *
 * Returns { needsClarification, reason }.
 */
async function runStage2(question, signal, clientOverride = null) {
  const client = clientOverride || getOpenAIClient();
  if (!client) return { needsClarification: false, reason: 'stage2_no_client' };

  const model = process.env[STAGE_2_MODEL_ENV] || STAGE_2_MODEL_DEFAULT;

  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const deadline = setTimeout(() => ac.abort(), STAGE_2_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: STAGE_2_SYSTEM_PROMPT },
          { role: 'user',   content: String(question || '').slice(0, 500) },
        ],
        temperature: 0,
        max_completion_tokens: 16,
        response_format: { type: 'json_object' },
      },
      { signal: ac.signal },
    );

    const raw = completion?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return { needsClarification: false, reason: 'stage2_no_content' };

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return { needsClarification: false, reason: 'stage2_parse_error' }; }
    if (typeof parsed?.answerable !== 'boolean') return { needsClarification: false, reason: 'stage2_no_field' };

    return parsed.answerable
      ? { needsClarification: false, reason: null }
      : { needsClarification: true,  reason: 'stage2_llm_unanswerable' };
  } catch (e) {
    return { needsClarification: false, reason: `stage2_error:${e?.code || e?.name || 'unknown'}` };
  } finally {
    clearTimeout(deadline);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * needsClarification(question, ctx)
 *
 * @param {string}  question
 * @param {object} [ctx]
 * @param {boolean} [ctx.hasUsableHistory] — true when the route has a
 *   resumable session_id with PRIOR MESSAGES (not just an empty
 *   pre-created session). Continuation stubs ("more?", "details?",
 *   "go on") get an automatic ALLOW from Stage 2 when this flag is set.
 *   Routes MUST derive this from message-count > 0, not just session-id
 *   presence — Codex r2 P1.
 * @param {AbortSignal} [ctx.signal] — forwarded to OpenAI for cascade-cancel.
 * @param {OpenAI} [ctx._stage2ClientOverride] — test seam only; do not pass
 *   from production code paths.
 *
 * @returns {Promise<{needsClarification, reason, message, stage}>}
 */
export async function needsClarification(question, ctx = {}) {
  if (process.env.NANA_CLARIFIER !== 'on') {
    return { needsClarification: false, reason: null, message: null, stage: 'flag-off' };
  }

  const stage1Reason = reasonForJunk(question);
  if (stage1Reason) {
    return {
      needsClarification: true,
      reason:  stage1Reason,
      message: CLARIFY_MESSAGE,
      stage:   'stage1',
    };
  }

  const stage2Enabled = process.env.NANA_CLARIFIER_LLM === 'on';
  const trimmed       = String(question || '').trim();
  const isAmbiguous   = trimmed.length <= STAGE_2_LENGTH_CEILING;

  // History-aware skip: continuation stubs are valid mid-conversation but
  // junk on a cold start. When the route reports usable history AND the
  // question matches the continuation pattern, ALLOW without calling Stage 2.
  if (ctx.hasUsableHistory === true && CONTINUATION_STUB_RE.test(trimmed)) {
    return { needsClarification: false, reason: 'continuation_with_history', message: null, stage: 'allow' };
  }

  if (stage2Enabled && isAmbiguous) {
    const verdict = await runStage2(question, ctx.signal || null, ctx._stage2ClientOverride || null);
    if (verdict.needsClarification) {
      return {
        needsClarification: true,
        reason:  verdict.reason,
        message: CLARIFY_MESSAGE,
        stage:   'stage2',
      };
    }
    return { needsClarification: false, reason: verdict.reason, message: null, stage: 'stage2' };
  }

  return { needsClarification: false, reason: null, message: null, stage: 'allow' };
}

/**
 * buildClarifierFinalPayload(message)
 *
 * Returns the payload shape both routes' SSE 'final' event consumers expect.
 * Backend tag is 'clarifier' so dashboard filters can split clarifier turns
 * from real chat turns.
 */
export function buildClarifierFinalPayload(message = CLARIFY_MESSAGE) {
  return {
    parsed: {
      sections: {
        short_answer:       message,
        you_might_also_ask: '',
      },
      sources_used: [],
      confidence: 'none',
      recommended_schools: null,
    },
    raw: message,
    parseError: null,
    validationIssues: [],
    claudeMs: 0,
    totalMs: 0,
    cost: { total_usd: 0, cost_input: 0, cost_output: 0, cost_cache_create: 0, cost_cache_read: 0, cache_hit_pct: 0 },
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    backend: 'clarifier',
    model:   null,
    retrieval: { chunks: [], sensitive: [] },
  };
}

// Internal helpers exported for tests
export const _internals = {
  reasonForJunk,
  classifyResidual,
  runStage2,
  CLARIFY_MESSAGE,
  STAGE_2_LENGTH_CEILING,
  CONTINUATION_STUB_RE,
};
