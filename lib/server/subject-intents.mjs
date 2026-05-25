// D-step-1 (2026-05-26): chat-side subject-intent regex pass.
//
// Populates ctx.subject_intents for DIMENSIONS.subject_strengths.rank() based
// on the parent's question text. Build Mode populates the same Set from a
// brief; chat populates it here. Extracted into its own module (vs inline in
// agentic-loop.js) so unit tests can import without dragging the whole
// tools.js dependency chain.
//
// DUPED from lib/research-room/score-for-build-mode.ts:534 — keep in sync.
// (Not migrated to a single source of truth because score-for-build-mode.ts
// is hot in a parallel session; consolidation deferred until that file is
// cold.)

export const SUBJECT_INTENT_RE = {
  maths:              /\b(?:maths?|mathemati(?:cs?|cal|cians?))\b/i,
  biology:            /\b(?:biolog(?:y|ists?|ical)|biomedical|biotech\w*)\b/i,
  chemistry:          /\b(?:chemist(?:ry|s|ries)?|chemical\w*)\b/i,
  physics:            /\b(?:physic(?:s|ists?)|astrophysic\w*|astronom(?:y|ers?|ical))\b/i,
  english:            /\b(?:english\s+(?:literature|lit|language\s+studies)|literature|creative\s+writing|poet(?:ry|s)|novelists?|english\s+(?:class|lessons?|teacher|essay|essays?|degree|department|major))\b/i,
  history:            /\b(?:historians?|history\s+(?:class|lessons?|teacher|essay|essays?|degree|department|major|geek|fan|enthusiast|book|books?|buff|of\s+art)|historical\s+(?:research|study|analysis|fiction|writing))\b/i,
  modern_languages:   /\b(?:french|spanish|german|mandarin|chinese|japanese|italian|latin|linguistic\w*|foreign\s+languages?)\b/i,
  computer_science:   /\b(?:computer\s*scien(?:ce|tists?)|comp\s*sci|coders?|coding|programmers?|programming|software\s+(?:engineer|engineering|engineers|developer|developers|development|design))\b/i,
  economics_business: /\b(?:(?:micro|macro)?economics?|economists?|econom(?:y|etric\w*)|business\s+(?:studies|class|management|administration|degree|school)|entrepreneur(?:s|ship|ial)?|accounting|commerce|financial\s+(?:markets?|literacy|analysis|degree)|finance(?!\s+(?:aid|app|company|department)))\b/i,
};

// Returns a Set of subject keys mentioned in the parent's question. Empty
// Set means the question is not subject-specific; DIMENSIONS.subject_strengths
// short-circuits to 0 in that case, so empty is safe.
export function extractSubjectIntents(question) {
  const out = new Set();
  if (typeof question !== 'string' || question.length === 0) return out;
  for (const [subject, re] of Object.entries(SUBJECT_INTENT_RE)) {
    if (re.test(question)) out.add(subject);
  }
  return out;
}
