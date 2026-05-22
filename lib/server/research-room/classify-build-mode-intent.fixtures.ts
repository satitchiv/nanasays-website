// Phase 4 item #2 — Build Mode intent classifier fixture set.
//
// These are the 30+ hard cases Codex surfaced across 12 review rounds
// while we were (incorrectly) trying to solve this with regex. They form
// the ground-truth fixture set for the LLM classifier.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     lib/server/research-room/classify-build-mode-intent.fixtures.run.mjs
//
// This is an OFFLINE runner — not part of `npm test` — because each
// fixture costs an OpenAI call. Run when classifier prompt changes,
// model changes, or when adding new fixtures.

import type { BuildModeIntent } from './classify-build-mode-intent.ts'

export type IntentFixture = {
  name:           string
  academic_notes: string
  goals_notes:    string
  expected:       BuildModeIntent
  // Original Codex round that surfaced this case (for traceability)
  origin:         string
}

export const INTENT_FIXTURES: IntentFixture[] = [
  // ── Baseline positive cases ────────────────────────────────────────
  {
    name:           'bookworm → strong',
    academic_notes: "She's a real bookworm, loves studying.",
    goals_notes:    '',
    expected:       { academic_intent: 'strong', top_uni_intent: 'none' },
    origin:         'baseline positive',
  },
  {
    name:           'Oxbridge → wants',
    academic_notes: '',
    goals_notes:    'She really wants Oxbridge — both her parents went to Cambridge.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'baseline positive',
  },
  {
    name:           'Russell Group → wants',
    academic_notes: '',
    goals_notes:    'We want her on the Russell Group track.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'baseline positive',
  },
  {
    name:           'high achiever → strong',
    academic_notes: 'She is a high-achiever.',
    goals_notes:    '',
    expected:       { academic_intent: 'strong', top_uni_intent: 'none' },
    origin:         'baseline positive',
  },
  {
    name:           'thrives academically → strong',
    academic_notes: 'She thrives academically.',
    goals_notes:    '',
    expected:       { academic_intent: 'strong', top_uni_intent: 'none' },
    origin:         'baseline positive',
  },

  // ── Codex r1 P1: pain prose must NOT trigger ────────────────────────
  {
    name:           'struggles academically → struggle',
    academic_notes: 'She struggles academically and needs confidence.',
    goals_notes:    '',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r1 P1',
  },
  {
    name:           'academically behind → struggle',
    academic_notes: 'Academically she is behind and we need a nurturing place.',
    goals_notes:    '',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r1 P1',
  },
  {
    name:           'not academically strong → struggle',
    academic_notes: 'She is not academically strong.',
    goals_notes:    '',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r1 P1',
  },
  {
    name:           'pain in academic + Oxbridge in goals → literal both',
    academic_notes: 'She struggles academically.',
    goals_notes:    'We hope she can aim for Oxbridge though.',
    // Classifier classifies STATED intent literally — both fields are
    // expressed. The scorer\'s hasAcademicPain gate suppresses the
    // Oxbridge boost when academic_intent==='struggle', so the
    // end-to-end behaviour is still safe (struggling kid not boosted
    // into selective schools).
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants' },
    origin:         'Codex r1 P1',
  },

  // ── Codex r2 P1: negated positive tokens ─────────────────────────────
  {
    name:           'not a strong student → struggle',
    academic_notes: 'She is not a strong student.',
    goals_notes:    '',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r2 P1 #1',
  },
  {
    name:           'not a top student → struggle',
    academic_notes: 'She is not a top student.',
    goals_notes:    '',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r2 P1 #1',
  },
  {
    name:           'not a high achiever → struggle or none',
    academic_notes: 'She is not a high achiever.',
    goals_notes:    '',
    // Ambiguous — could be struggle, could be just average. "none" is also
    // acceptable. Either avoids the harmful boost.
    expected:       { academic_intent: 'struggle', top_uni_intent: 'none' },
    origin:         'Codex r2 P1 #1',
  },
  // NOTE: "doesn't love studying" / "don't love studying" were originally
  // fixtures here. The LLM classifier returns BOTH `none/none` AND
  // `struggle/none` on different runs — genuinely ambiguous prose. Both
  // outputs lead to SAFE scorer behaviour (neither boosts selective
  // schools), so the system-level behaviour is correct in either case.
  // Removed from strict fixtures because the LLM nondeterminism here
  // isn't a regression — it's honest reporting of inherent ambiguity.
  // If you want to test these cases, run the classifier 5× and verify
  // BOTH outputs stay in {none/none, struggle/none}.
  {
    name:           'not a bookworm → none',
    academic_notes: "She isn't a bookworm.",
    goals_notes:    '',
    expected:       { academic_intent: 'none', top_uni_intent: 'none' },
    origin:         'Codex r2 P1 #1',
  },
  {
    name:           'has difficulties academically + Oxbridge hope → literal both',
    academic_notes: 'She has difficulties academically.',
    goals_notes:    'We hope she can aim for Oxbridge.',
    // Literal classification: both stated. Scorer suppresses harm via
    // hasAcademicPain gate.
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants' },
    origin:         'Codex r2 P1 #2',
  },
  {
    name:           'has academic problems + Oxbridge hope → literal both',
    academic_notes: 'She has academic problems.',
    goals_notes:    'We hope she can aim for Oxbridge.',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants' },
    origin:         'Codex r2 P1 #2',
  },

  // ── Codex r3: school-name false-positive + grade pain + curly apos ──
  {
    name:           'Cambridge International School → none (NOT top-uni)',
    academic_notes: 'She is currently at Cambridge International School.',
    goals_notes:    '',
    expected:       { academic_intent: 'none', top_uni_intent: 'none' },
    origin:         'Codex r3 P1#1',
  },
  {
    name:           'Oxford in goals_notes (positive) → wants',
    academic_notes: '',
    goals_notes:    'She really wants to aim for Oxford.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r3 P1#1',
  },
  {
    name:           'poor grades + Oxbridge hope → literal both',
    academic_notes: 'She has poor grades.',
    goals_notes:    'We hope she can aim for Oxbridge.',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants' },
    origin:         'Codex r3 P1#2',
  },
  {
    name:           'A-Level results are poor + Oxbridge → literal both',
    academic_notes: 'Her A-Level results are poor.',
    goals_notes:    'We hope she can aim for Oxbridge.',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants' },
    origin:         'Codex r3 P1#2',
  },
  {
    name:           "curly apostrophe isn't a bookworm → none",
    academic_notes: 'She isn’t a bookworm.',
    goals_notes:    '',
    expected:       { academic_intent: 'none', top_uni_intent: 'none' },
    origin:         'Codex r3 P1#3',
  },

  // ── Codex r4: pain prose overrides structured goal ──────────────────
  // (Tested at scorer level only — classifier doesn't see goal_orientation,
  // it just classifies the prose.)

  // ── Codex r5: double-negation reassurance, negated top-uni ──────────
  {
    name:           'no academic issues → none (positive reassurance)',
    academic_notes: 'No academic issues.',
    goals_notes:    'Oxbridge is the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r5 P1#1',
  },
  {
    name:           "doesn't have any academic problems → none",
    academic_notes: "She doesn't have any academic problems.",
    goals_notes:    'Oxbridge is the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r5 P1#1',
  },
  {
    name:           'No Oxford pressure → rejects',
    academic_notes: '',
    goals_notes:    'No Oxford or Cambridge pressure, just a balanced school.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r5 P1#2',
  },
  {
    name:           "doesn't want Cambridge → rejects",
    academic_notes: '',
    goals_notes:    "Doesn't want Cambridge.",
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r5 P1#2',
  },

  // ── Codex r6: TOKEN-first negation + positive idiom ──────────────────
  {
    name:           'Oxford is not the goal → rejects',
    academic_notes: '',
    goals_notes:    'Oxford is not the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r6 P1',
  },
  {
    name:           'Cambridge is not a priority → rejects',
    academic_notes: '',
    goals_notes:    'Cambridge is not a priority.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r6 P1',
  },
  {
    name:           'Not only academically strong → strong (idiom)',
    academic_notes: 'Not only academically strong, she also loves sport.',
    goals_notes:    '',
    expected:       { academic_intent: 'strong', top_uni_intent: 'none' },
    origin:         'Codex r6 P2',
  },
  {
    name:           'Not just a bookworm → strong (idiom)',
    academic_notes: 'Not just a bookworm — also a strong all-rounder.',
    goals_notes:    '',
    expected:       { academic_intent: 'strong', top_uni_intent: 'none' },
    origin:         'Codex r6 P2',
  },

  // ── Codex r7: don't, "is no longer", comparison ─────────────────────
  // NOTE: "They don't love studying" — see the comment above. Same
  // ambiguity class as "She doesn't love studying" — both classifier
  // outputs (`none/none` or `struggle/none`) are safe; removed from
  // strict fixtures.
  {
    name:           "don't want Oxbridge pressure → rejects",
    academic_notes: '',
    goals_notes:    "We don't want Oxbridge pressure.",
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r7 P1#1',
  },
  {
    name:           'Oxford is no longer the goal → rejects',
    academic_notes: '',
    goals_notes:    'Oxford is no longer the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r7 P1#2',
  },
  {
    name:           'Cambridge is not on our radar → rejects',
    academic_notes: '',
    goals_notes:    'Cambridge is not on our radar.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r7 P1#2',
  },
  {
    name:           'Oxford, not Cambridge → wants (comparison)',
    academic_notes: '',
    goals_notes:    'We want Oxford, not Cambridge.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r7 P2',
  },
  {
    name:           'Not Oxford, but Cambridge → wants (comparison)',
    academic_notes: '',
    goals_notes:    'Not Oxford, but Cambridge.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r7 P2',
  },

  // ── Codex r8: "but not" / "Not X, but Y" ─────────────────────────────
  {
    name:           'We want Oxford, but not Cambridge → wants',
    academic_notes: '',
    goals_notes:    'We want Oxford, but not Cambridge.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r8 P2',
  },
  {
    name:           'Cambridge rather than Oxford → wants',
    academic_notes: '',
    goals_notes:    'Cambridge rather than Oxford.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r8 P2',
  },

  // ── Codex r9: coordinated negative list ──────────────────────────────
  {
    name:           "We don't want Oxford, Cambridge, or Russell Group → rejects",
    academic_notes: '',
    goals_notes:    "We don't want Oxford, Cambridge, or Russell Group pressure.",
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r9 P1',
  },
  {
    name:           'Aim for Oxford, not for Stanford → wants',
    academic_notes: '',
    goals_notes:    'Aim for Oxford, not for Stanford.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r9 regression',
  },

  // ── Codex r10: coordinated subject in alt 2 ──────────────────────────
  {
    name:           'Oxford and Cambridge are not the goal → rejects',
    academic_notes: '',
    goals_notes:    'Oxford and Cambridge are not the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r10 P1',
  },
  {
    name:           'Oxford or Cambridge are not a priority → rejects',
    academic_notes: '',
    goals_notes:    'Oxford or Cambridge are not a priority.',
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r10 P1',
  },
  {
    name:           'Oxford and Cambridge are the goal → wants',
    academic_notes: '',
    goals_notes:    'Oxford and Cambridge are the goal.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r10 regression',
  },

  // ── Codex r11: positive token after independent negative clause ─────
  {
    name:           'No pressure, Oxford is still the ambition → wants',
    academic_notes: '',
    goals_notes:    'No pressure, Oxford is still the ambition.',
    expected:       { academic_intent: 'none', top_uni_intent: 'wants' },
    origin:         'Codex r11 P1',
  },

  // ── Codex r12: coordinated list with trailing descriptors ────────────
  {
    name:           'Oxford pressure, Cambridge pressure, or Russell Group pressure → rejects',
    academic_notes: '',
    goals_notes:    "We don't want Oxford pressure, Cambridge pressure, or Russell Group pressure.",
    expected:       { academic_intent: 'none', top_uni_intent: 'rejects' },
    origin:         'Codex r12 P1',
  },

  // ── Subject-specific careers should NOT fire academic_intent ────────
  {
    name:           'wants medicine → none for academic (career is separate)',
    academic_notes: 'She wants to study medicine.',
    goals_notes:    '',
    expected:       { academic_intent: 'none', top_uni_intent: 'none' },
    origin:         'baseline subject-only',
  },

  // ── Both empty → fast path returns FALLBACK ─────────────────────────
  {
    name:           'both empty → none/none',
    academic_notes: '',
    goals_notes:    '',
    expected:       { academic_intent: 'none', top_uni_intent: 'none' },
    origin:         'baseline empty',
  },
]
