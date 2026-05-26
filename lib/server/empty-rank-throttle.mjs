// empty-rank-throttle.mjs (Codex P1.3 perf fix 2026-05-26)
//
// When rankSchools returns 0 scoreable schools, the agentic loop has
// historically cascaded into 3-4 diagnostic getSchoolFacts calls (one per
// shortlist school), burning the entire turn budget and producing the 10×
// chat-slowness the user reported. This helper caps subsequent
// getSchoolFacts calls at EMPTY_RANK_DIAG_BUDGET, then forces the model
// toward final_answer with a what_we_dont_know acknowledgement.
//
// Pure functions only — agentic-loop.js holds the live state and consults
// these helpers at dispatch time.

export const EMPTY_RANK_DIAG_BUDGET = 1;

// Append this to the TOOL RESULT message when rankSchools came back empty
// so the model is steered toward final_answer instead of cascading.
export const EMPTY_RANK_HINT =
  '\n\nNOTE: rankSchools returned 0 scoreable schools — structured data is sparse for this dimension. ' +
  `You may make AT MOST ${EMPTY_RANK_DIAG_BUDGET} diagnostic getSchoolFacts call to verify, then emit ` +
  'final_answer with what_we_dont_know. Do not retry rankSchools with a different dimension; ' +
  'the data will not materialise from a different angle.';

// Initial throttle state. Mutate in place from agentic-loop.js — keeping a
// single object lets the caller pass it by reference into both helpers.
//
// `activatedDimension` carries the dimension argument that produced the
// empty rankSchools result so reject telemetry can name the dimension that
// originally tripped the cascade (Codex r2 fix). Cleared on re-arm.
export function makeEmptyRankState() {
  return { emptyRankSeen: false, diagFactCallsAfterEmpty: 0, activatedDimension: null };
}

// True when rankSchools returned a well-formed but empty schools list.
// compareSchools is intentionally NOT included: it's a fixed-slug compare
// that returns the slugs it was given, so "empty" doesn't carry the same
// "structured data sparse" signal Codex flagged.
export function isEmptyRankResult(toolName, result) {
  if (toolName !== 'rankSchools') return false;
  if (!result || typeof result !== 'object') return false;
  if (!Array.isArray(result.schools)) return false;
  return result.schools.length === 0;
}

// Decide BEFORE dispatch whether to throttle this getSchoolFacts call.
// Returns { throttle: true, reason } when over budget; { throttle: false }
// otherwise. Caller injects `reason` as a SYSTEM NOTE into messages.
export function shouldThrottleFactCall(toolName, state, budget = EMPTY_RANK_DIAG_BUDGET) {
  if (toolName !== 'getSchoolFacts') return { throttle: false };
  if (!state?.emptyRankSeen)         return { throttle: false };
  if (state.diagFactCallsAfterEmpty < budget) return { throttle: false };
  return {
    throttle: true,
    reason:
      `rankSchools previously returned no scoreable schools and you've already made ${budget} ` +
      'diagnostic getSchoolFacts call. Structured data is sparse for this question — emit ' +
      'final_answer NOW. Use what_we_dont_know to acknowledge the gap honestly. ' +
      'Do NOT make additional getSchoolFacts calls.',
  };
}

// Update throttle state AFTER a tool call completes. Mutates the passed
// state object so the caller doesn't need to thread a return value back.
//
// Rules:
//   - empty rankSchools result → mark emptyRankSeen=true + record dimension
//     (start throttling; dimension surfaces in reject telemetry)
//   - non-empty rankSchools     → clear emptyRankSeen + reset counter +
//     clear dimension (the model recovered with a working dimension)
//   - getSchoolFacts while emptyRankSeen → increment counter
//
// `toolArgs` is optional and only consulted on rankSchools to capture the
// dimension that activated the cascade.
export function updateEmptyRankState(toolName, toolResult, state, toolArgs = null) {
  if (!state) return;
  if (toolName === 'rankSchools') {
    if (isEmptyRankResult('rankSchools', toolResult)) {
      state.emptyRankSeen = true;
      state.activatedDimension = toolArgs?.dimension ?? toolResult?.dimension ?? null;
    } else if (Array.isArray(toolResult?.schools)) {
      state.emptyRankSeen = false;
      state.diagFactCallsAfterEmpty = 0;
      state.activatedDimension = null;
    }
    return;
  }
  if (toolName === 'getSchoolFacts' && state.emptyRankSeen) {
    state.diagFactCallsAfterEmpty++;
  }
}
