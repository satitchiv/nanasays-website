// Phase 4 item #2 + item #3 — Build Mode intent classifier fixture set.
//
// Item #2: the 30+ hard cases Codex surfaced across 12 regex review rounds
// before we pivoted to LLM. Ground-truth fixture set for academic_intent +
// top_uni_intent. DO NOT MODIFY these fixtures — they lock item #2 against
// regression.
//
// Item #3: additional fixtures exercising the 6 new output fields
// (pastoral_priority, inclusive_priority, small_env_pref,
// boarding_pref_from_prose, current_school_pain, parent_drill_focus).
// These fixtures use the 4 new prose inputs (personality_notes,
// child_wants, went_wrong, drill_down) as the LLM input.
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

// Item #3: fixtures may assert ANY SUBSET of the 8 output fields.
// classification_version is attached programmatically post-classify, so
// fixtures don't need to (and shouldn't) assert it. Input fields mirror
// the classifier's `ClassifyOptions` (5 actual prose fields — went_wrong
// and drill_down are interview progress targets, not data fields).
export type IntentFixture = {
  name:               string
  academic_notes?:    string
  goals_notes?:       string
  personality_notes?: string
  child_wants?:       string
  anchors_notes?:     string
  expected:           Partial<Omit<BuildModeIntent, 'classification_version'>>
  // Original Codex round that surfaced this case (for traceability)
  origin:             string
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

  // ────────────────────────────────────────────────────────────────────
  // PHASE 4 ITEM #3 FIXTURES (2026-05-22) — 6 new output fields
  //
  // Each fixture asserts ONLY the field(s) under test. classifier returns
  // all 8 fields but the runner only checks asserted keys. This keeps
  // each fixture focused and lets item #2 fixtures stay locked to their
  // original 2-field contract.
  //
  // Codex parent-harm patterns covered:
  //   - "Bored" must NOT become 'wants Eton-tier selectivity'
  //   - "Small schools didn't work" must NOT become small-school boost
  //   - "Not boarding" must NOT become boarding-school signal
  //   - LGBTQ concerns must NOT flatten into pastoral
  //   - Religion mismatch (cultural) without direction → log only, no score
  //   - Drill-down text classifies to wizard-enum, doesn't invent values
  // ────────────────────────────────────────────────────────────────────

  // ── pastoral_priority ───────────────────────────────────────────────
  {
    name:              'anxious sensitive boy → pastoral high',
    personality_notes: 'He is a sensitive boy, quite anxious and shy. Lost his confidence after his Year 7 transition.',
    expected:          { pastoral_priority: 'high' },
    origin:            'item-3 pastoral',
  },
  {
    name:              'bullied at current school → pastoral high + pain pastoral',
    personality_notes: 'Bullied badly in Years 7-8. He came home crying many times.',
    expected:          { pastoral_priority: 'high', current_school_pain: 'pastoral' },
    origin:            'item-3 pastoral pain reinforcement (rule 10)',
  },
  {
    name:              'resilient outgoing kid → pastoral normal',
    personality_notes: 'She is outgoing, makes friends easily, very resilient.',
    expected:          { pastoral_priority: 'normal' },
    origin:            'item-3 pastoral negative case (resilient → normal per prompt)',
  },
  {
    name:              'no pastoral concerns → normal (double-negation reassurance, rule 3)',
    personality_notes: 'No pastoral worries — she has been fine emotionally.',
    expected:          { pastoral_priority: 'normal' },
    origin:            'item-3 pastoral negation rule 3 (reassurance → normal, NOT high)',
  },

  // ── inclusive_priority (distinct from pastoral, rule 14) ────────────
  {
    name:              'queer child needing inclusion → inclusive high, NOT pastoral',
    personality_notes: 'Our child is queer and we want a school where that is celebrated rather than tolerated.',
    expected:          { inclusive_priority: 'high', pastoral_priority: 'none' },
    origin:            'item-3 inclusive rule 14',
  },
  {
    name:              'non-binary kid → inclusive high',
    personality_notes: 'They are non-binary; an inclusive culture is critical for us.',
    expected:          { inclusive_priority: 'high' },
    origin:            'item-3 inclusive',
  },
  {
    name:              'anxious queer kid → BOTH pastoral high AND inclusive high',
    personality_notes: 'Anxious queer 13yo; needs nurturing AND an inclusive culture.',
    expected:          { pastoral_priority: 'high', inclusive_priority: 'high' },
    origin:            'item-3 inclusive + pastoral overlap rule 14',
  },
  {
    name:              'religion-as-identity → inclusive high (NOT cultural pain)',
    anchors_notes:     'Practising Muslim family; we want a school where her identity is welcomed.',
    expected:          { inclusive_priority: 'high' },
    origin:            'item-3 inclusive religion-as-identity',
  },

  // ── small_env_pref ──────────────────────────────────────────────────
  {
    name:           'wants smaller school → wants',
    child_wants:    'She wants somewhere smaller, more personal.',
    expected:       { small_env_pref: 'wants' },
    origin:         'item-3 small wants',
  },
  {
    name:           'small classes please → wants',
    anchors_notes:  'Smaller class sizes are important to us — she needs more individual attention.',
    expected:       { small_env_pref: 'wants' },
    origin:         'item-3 small wants (anchors)',
  },
  {
    name:           'thrives in big bustling community → rejects',
    personality_notes: 'She thrives in big bustling communities — small schools feel stifling to her.',
    expected:       { small_env_pref: 'rejects' },
    origin:         'item-3 small rejects (Codex harm class)',
  },
  {
    name:              'small schools did not work past → rejects/none (rule 13)',
    personality_notes: 'Small schools have not worked — she needs more stimulation and more peers.',
    expected:          { small_env_pref: 'rejects' },
    origin:            'item-3 small direction rule 13 (Codex parent-harm)',
  },

  // ── boarding_pref_from_prose ────────────────────────────────────────
  {
    name:           'wants full boarding → full',
    child_wants:    'We want full boarding — 7 days a week, immersive.',
    expected:       { boarding_pref_from_prose: 'full' },
    origin:         'item-3 boarding full',
  },
  {
    name:           'weekly boarding suits us → weekly',
    anchors_notes:  'Weekly boarding — we want her home at weekends.',
    expected:       { boarding_pref_from_prose: 'weekly' },
    origin:         'item-3 boarding weekly',
  },
  {
    name:           'not ready for boarding → rejects (rule 12)',
    child_wants:    'She is not ready for boarding. Day school only.',
    expected:       { boarding_pref_from_prose: 'rejects' },
    origin:         'item-3 boarding rejects rule 12 (Codex parent-harm)',
  },
  {
    name:           'no boarding → rejects (must NOT infer wants full)',
    anchors_notes:  'No boarding under any circumstances.',
    expected:       { boarding_pref_from_prose: 'rejects' },
    origin:         'item-3 boarding rejects rule 12',
  },
  {
    name:           'incidental positive boarding mention → none (rule 12: no inferred wants full)',
    academic_notes: 'She has been attending day school in our local catchment.',
    anchors_notes:  'We have looked at one or two boarding options as a comparison.',
    // Tests rule 12 specifically: passing mention of "boarding" must NOT
    // become 'full'. Defaults to 'none' (no explicit signal).
    expected:       { boarding_pref_from_prose: 'none' },
    origin:         'item-3 boarding rule 12 — no inferred wants',
  },

  // ── current_school_pain ─────────────────────────────────────────────
  {
    name:              'bored, ahead of class → academic_bored',
    academic_notes:    'She is well ahead of her class — the work is too easy and she has switched off.',
    expected:          { current_school_pain: 'academic_bored' },
    origin:            'item-3 pain bored',
  },
  {
    name:              'bored ≠ strong academic intent (rule 11)',
    academic_notes:    'She is bored at her current school.',
    expected:          { current_school_pain: 'academic_bored', academic_intent: 'none' },
    origin:            'item-3 pain bored rule 11 (Codex parent-harm)',
  },
  {
    name:              'overwhelmed, falling behind → academic_overwhelmed',
    academic_notes:    'She is overwhelmed, falling behind in every subject. The pace is too much.',
    expected:          { current_school_pain: 'academic_overwhelmed', academic_intent: 'struggle' },
    origin:            'item-3 pain overwhelmed',
  },
  {
    name:              'pastoral pain (lonely) → pain pastoral + pastoral high',
    personality_notes: 'She has no real friends at her current school. Lonely and miserable.',
    expected:          { current_school_pain: 'pastoral', pastoral_priority: 'high' },
    origin:            'item-3 pain pastoral rule 10',
  },
  {
    name:              'logistical (long commute) → logistical',
    anchors_notes:     'The commute is 90 minutes each way — it is killing her.',
    expected:          { current_school_pain: 'logistical' },
    origin:            'item-3 pain logistical',
  },
  {
    name:              'generic dissatisfaction without cause → none',
    academic_notes:    'We just want a fresh start.',
    expected:          { current_school_pain: 'none' },
    origin:            'item-3 pain none (conservative rule 8)',
  },

  // ── parent_drill_focus (must match wizard enum, rule 9) ─────────────
  {
    name:           'parent priority academic → academic',
    anchors_notes:  'Above all, we want strong academic results and a clear university pathway.',
    expected:       { parent_drill_focus: 'academic' },
    origin:         'item-3 drill_focus academic',
  },
  {
    name:           'parent priority pastoral → pastoral',
    anchors_notes:  'Pastoral care is what matters most to us — her wellbeing first.',
    expected:       { parent_drill_focus: 'pastoral' },
    origin:         'item-3 drill_focus pastoral',
  },
  {
    name:           'parent priority sport → sport',
    anchors_notes:  'Sport is the priority — she trains five days a week.',
    expected:       { parent_drill_focus: 'sport' },
    origin:         'item-3 drill_focus sport',
  },
  {
    name:           'all-rounder → all-round',
    anchors_notes:  'We want a genuine all-rounder — academics, sport, music, the lot.',
    expected:       { parent_drill_focus: 'all-round' },
    origin:         'item-3 drill_focus all-round',
  },
  {
    name:           'parent says "cost" (not in wizard enum) → none, rule 9',
    anchors_notes:  'Honestly, cost is the biggest factor for us. We need value for money.',
    expected:       { parent_drill_focus: 'none' },
    origin:         'item-3 drill_focus enum-discipline rule 9',
  },
  {
    name:           'parent says "community" (not in wizard enum) → none, rule 9',
    anchors_notes:  'The right community matters more than anything.',
    expected:       { parent_drill_focus: 'none' },
    origin:         'item-3 drill_focus enum-discipline rule 9',
  },

  // ── Cross-field interaction (item #2 + item #3 together) ────────────
  {
    name:           'struggling kid + Oxbridge hope + bored framing → struggle/wants + overwhelmed (NOT bored)',
    academic_notes: 'Her grades have been poor; she struggles with the workload.',
    goals_notes:    'We still hope she can aim for Cambridge one day.',
    expected:       { academic_intent: 'struggle', top_uni_intent: 'wants', current_school_pain: 'academic_overwhelmed' },
    origin:         'item-3 cross-field consistency',
  },
  {
    name:              'queer + struggling academically → struggle + inclusive high (identity-only)',
    academic_notes:    'She is academically behind, year below grade level.',
    personality_notes: 'LGBTQ-inclusive is critical — she is gay and the current school is hostile to that.',
    expected:          { academic_intent: 'struggle', inclusive_priority: 'high' },
    origin:            'item-3 multi-field — identity hostility is inclusive, NOT generic pastoral (rule 14)',
  },
  {
    name:              'queer + lonely AND struggling → academic_overwhelmed wins pain slot (rule 16)',
    academic_notes:    'She is academically behind, year below grade level. The pace is impossible.',
    personality_notes: 'She is gay, the school is hostile to LGBTQ, AND she has been miserable and isolated. Bullied for being herself.',
    // Per rule 16: when both academic and pastoral pain present, academic
    // takes the single current_school_pain slot. Pastoral signal is still
    // captured via its own pastoral_priority='high' output.
    expected:          { academic_intent: 'struggle', inclusive_priority: 'high', pastoral_priority: 'high', current_school_pain: 'academic_overwhelmed' },
    origin:            'item-3 multi-pain rule 16 + rule 14 + rule 10',
  },

  // ── Codex r1 review (2026-05-22) fixture additions ──────────────────
  {
    name:              'multi-pain: academic overwhelmed + pastoral lonely → overwhelmed wins pain (rule 16)',
    academic_notes:    'She has been drowning in the workload, falling behind in every subject.',
    personality_notes: 'She is also very lonely — has not made friends in the year she has been there.',
    expected:          {
      academic_intent:     'struggle',
      current_school_pain: 'academic_overwhelmed',
      pastoral_priority:   'high',
    },
    origin:            'item-3 Codex r1 multi-pain priority rule 16',
  },
  {
    name:              'multi-pain: bored AND lonely → academic_bored wins over pastoral in pain slot',
    academic_notes:    'She is well ahead — the work is too easy and she has switched off.',
    personality_notes: 'She is also lonely at school, no real friends.',
    // Per rule 16: academic > pastoral in current_school_pain. Pastoral
    // is still captured via pastoral_priority='high'.
    expected:          {
      current_school_pain: 'academic_bored',
      pastoral_priority:   'high',
    },
    origin:            'item-3 Codex r1 multi-pain priority rule 16 (bored variant)',
  },
  {
    name:           'ethos-neutral sentinel: religion mention without identity/inclusion signal → none',
    anchors_notes:  'We are Anglican; faith is part of our family but not a fixed requirement for the school.',
    // Codex r2 Q6: ensure a benign religion mention doesn't accidentally
    // fire inclusive_priority='high' or parent_drill_focus='all-round'.
    // Religion-specific preferences belong in wizard ethos_pref, not here.
    expected:       {
      inclusive_priority:  'none',
      parent_drill_focus:  'none',
      current_school_pain: 'none',
    },
    origin:         'item-3 Codex r2 ethos-neutral sentinel (rule 17)',
  },
  {
    name:           'religion-specific request sentinel: "we want a Catholic school" → no classifier output',
    anchors_notes:  'We are looking for a Catholic boarding school for our daughter.',
    // Codex r3 Low #1: rule 17 says religion-specific requests do NOT
    // encode in any classifier output — they belong in wizard ethos_pref.
    // parent_drill_focus must NOT become 'all-round' or anything else.
    // inclusive_priority should NOT fire (this is about wanting a
    // religious school, not about identity-belonging safety).
    expected: {
      inclusive_priority:  'none',
      parent_drill_focus:  'none',
      current_school_pain: 'none',
    },
    origin: 'item-3 Codex r3 religion-specific request sentinel (rule 17)',
  },
  {
    name:              'all-neutral sentinel: pure factual prose with no signals → all none/normal',
    academic_notes:    'She is in Year 9 at her current independent school.',
    goals_notes:       'We are looking for a school for sixth form.',
    personality_notes: 'She enjoys reading and spending time with her cousins.',
    child_wants:       'She has not strongly stated what she wants in a new school.',
    anchors_notes:     'We are open to most options.',
    // Sentinel for accidental new-field false positives — purely
    // descriptive prose should never trigger any HIGH/wants signal.
    expected: {
      academic_intent:         'none',
      top_uni_intent:          'none',
      pastoral_priority:       'none',
      inclusive_priority:      'none',
      small_env_pref:          'none',
      boarding_pref_from_prose: 'none',
      current_school_pain:     'none',
      parent_drill_focus:      'none',
    },
    origin: 'item-3 Codex r1 all-neutral sentinel',
  },
  // ── 2026-05-27 flexi-boarding enum addition ────────────────────────
  // Eval battery (Theo persona, sixth-form IB boy) surfaced 2× misses
  // where parent prose explicitly said "flexible boarding" but
  // classifier emitted 'none' because enum was missing 'flexi'.
  // Fixtures lock the new value's recognition + ambient signals.
  {
    name:         'flexi: open to flexible boarding → flexi',
    anchors_notes: 'South East England is essential. We are open to flexible boarding if the right school comes along. Budget is £40-50k per year.',
    expected:     { boarding_pref_from_prose: 'flexi' },
    origin:       '2026-05-27 flexi-enum slice — Theo persona r2 anchors_notes',
  },
  {
    name:         'flexi: a few nights a week → flexi',
    anchors_notes: 'Day commute is hard in the week, so a few nights a week boarding suits us.',
    expected:     { boarding_pref_from_prose: 'flexi' },
    origin:       '2026-05-27 flexi-enum slice — paraphrased',
  },
  {
    name:         'flexi: full boarding still wins over flexible mention',
    // Sanity check — explicit "full boarding" should still pin to
    // 'full' even when the word "flexible" appears in a different
    // context. Locks against the new enum value over-firing.
    academic_notes: 'We want full boarding — he is ready for the immersive experience.',
    anchors_notes:  'Flexible on which county; full boarding is the requirement.',
    expected:       { boarding_pref_from_prose: 'full' },
    origin:         '2026-05-27 flexi-enum slice — over-fire regression guard',
  },
  {
    name:         'flexi-vs-none boundary: flexible-on-location + maybe boarding → none',
    // Codex r1 P2 #3 (2026-05-27) — the riskier boundary. Generic
    // "flexible" wording about location + ambivalent boarding stance
    // must stay 'none', not coerce to 'flexi'.
    anchors_notes: "We're flexible on location and might consider boarding, but no boarding preference yet.",
    expected:      { boarding_pref_from_prose: 'none' },
    origin:        '2026-05-27 Codex r1 P2 — flexi-vs-none boundary',
  },
]
