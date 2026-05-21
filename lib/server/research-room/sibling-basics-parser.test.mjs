// rr-8-build3-sibling-gender-year chat-quality (2026-05-21) —
// deterministic safety-net parser tests.
//
// Pure-function tests. Run via:
//   cd website
//   node --experimental-strip-types --test \
//     lib/server/research-room/sibling-basics-parser.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseSiblingBasicsAnswer } from './sibling-basics-parser.ts'

// Convenience — the prior Nana prose that asks about year group.
const NANA_ASKED_YEAR =
  "is yoyo your son or daughter, and what year are they entering — Year 7, Year 9, Year 10, Sixth Form, or not sure?"

const NANA_ASKED_GENDER_ONLY =
  "got it. is yoyo your son or daughter?"

// ── Year extraction — the smoking-gun "year 9" case ──────────────────

test('parser: "year 9" extracts year-9 (the bug that started this fix)', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: 'year 9',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-9')
})

test('parser: "Year 9" (capitalised) extracts year-9', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: 'Year 9',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-9')
})

test('parser: "y9" / "yr 9" / "9th year" / "ninth" all extract year-9', () => {
  for (const input of ['y9', 'yr 9', 'Y9', '9th year', 'ninth', 'ninth year']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'year-9', `failed on "${input}"`)
  }
})

test('parser: year-10 patterns', () => {
  for (const input of ['year 10', 'Year 10', 'y10', 'yr 10', '10th year', '10th grade']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'year-10', `failed on "${input}"`)
  }
})

test('parser: year-7 patterns', () => {
  for (const input of ['year 7', 'y7', 'yr 7', 'seventh', 'seventh year']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'year-7', `failed on "${input}"`)
  }
})

test('parser: sixth-form patterns (Y12 / Y13 / sixth form / 6th form / L6 / U6)', () => {
  for (const input of ['sixth form', '6th form', 'lower sixth', 'upper sixth', 'L6', 'u6', 'year 12', 'y12', 'year 13', 'y13']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'sixth-form', `failed on "${input}"`)
  }
})

test('parser: deflections map to not-sure', () => {
  for (const input of ['not sure', "don't know", 'dunno', 'unclear', 'undecided', 'tbc', 'tbd', 'depends']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'not-sure', `failed on "${input}"`)
  }
})

// ── Year disambiguation: longer patterns beat shorter ────────────────

test('parser: "year 10" matches year-10 (NOT year-1)', () => {
  // Regression guard against ordering bugs in YEAR_PATTERNS — y10 must
  // come before y1 in the pattern list (we don't have y1 explicitly,
  // but the ordering principle matters for future extensions).
  const out = parseSiblingBasicsAnswer({
    userMessage: 'year 10',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-10')
})

test('parser: "sixth form" matches sixth-form (NOT picks up "form" elsewhere)', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: 'sixth form',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'sixth-form')
})

// ── Bare-number gating: only counts WHEN Nana asked about year ───────

test('parser: bare "9" extracts year-9 WHEN prior Nana prose asked about year', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: '9',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-9')
})

test('parser: bare "10" extracts year-10 WHEN prior Nana prose asked about year', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: '10',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-10')
})

test('parser: bare "9" does NOT extract year-9 WHEN Nana did not ask about year', () => {
  // Parent might be answering an unrelated question ("how many kids?")
  // or just sending a fragment. Without year context, the parser
  // must abstain rather than confidently mis-classify.
  const out = parseSiblingBasicsAnswer({
    userMessage: '9',
    lastNanaProse: 'tell me about yoyo as a person',
  })
  assert.equal(out.child_year, null)
})

test('parser: bare "9" does NOT extract year-9 WHEN there is no prior Nana prose', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: '9',
    lastNanaProse: null,
  })
  assert.equal(out.child_year, null)
})

test('parser: bare "9 kids" does NOT trigger bare-number rule (not a clean number)', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: '9 kids',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  // The bare-number regex requires the whole message to be just a number.
  // "9 kids" has additional content, so it falls through to pattern-match,
  // where it doesn't match any YEAR_PATTERN.
  assert.equal(out.child_year, null)
})

// ── Gender extraction ────────────────────────────────────────────────

test('parser: "son" / "boy" / "lad" / "male" all extract boy', () => {
  for (const input of ['son', 'boy', 'lad', 'male', 'he\'s', 'his']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_GENDER_ONLY,
    })
    assert.equal(out.child_gender, 'boy', `failed on "${input}"`)
  }
})

test('parser: "daughter" / "girl" / "she" all extract girl', () => {
  for (const input of ['daughter', 'girl', 'lass', 'female', 'she\'s', 'her']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_GENDER_ONLY,
    })
    assert.equal(out.child_gender, 'girl', `failed on "${input}"`)
  }
})

test('parser: "either" / "both" / "no preference" / "co-ed only" → either', () => {
  for (const input of ['either', 'both', 'no preference', "doesn't matter", 'open', 'co-ed only', 'keep it open']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_GENDER_ONLY,
    })
    assert.equal(out.child_gender, 'either', `failed on "${input}"`)
  }
})

test('parser: skip/refusal language → either (same as deflection)', () => {
  for (const input of ['skip', 'rather not say', 'leave it blank', 'next question', 'pass', 'n/a']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_GENDER_ONLY,
    })
    assert.equal(out.child_gender, 'either', `failed on "${input}"`)
  }
})

// ── Both-at-once extractions ─────────────────────────────────────────

test('parser: "she\'s entering year 9" extracts BOTH (year-9 + girl)', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: "she's entering year 9",
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-9')
  assert.equal(out.child_gender, 'girl')
})

test('parser: "he\'s going into Y10" extracts both', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: "he's going into Y10",
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, 'year-10')
  assert.equal(out.child_gender, 'boy')
})

// ── Negative cases — must NOT false-positive ─────────────────────────

test('parser: prose with no clear basics returns both null', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: 'tell me about pastoral care',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, null)
  assert.equal(out.child_gender, null)
})

test('parser: empty / whitespace user message → both null', () => {
  const a = parseSiblingBasicsAnswer({ userMessage: '',    lastNanaProse: NANA_ASKED_YEAR })
  const b = parseSiblingBasicsAnswer({ userMessage: '   ', lastNanaProse: NANA_ASKED_YEAR })
  assert.equal(a.child_year, null)
  assert.equal(a.child_gender, null)
  assert.equal(b.child_year, null)
  assert.equal(b.child_gender, null)
})

test('parser: "I have 7 children" does NOT mis-fire on "7" via bare-number rule', () => {
  // The bare-number rule only fires when the message is just a number.
  // "I have 7 children" doesn't match the bare-number regex, and the
  // year patterns require word boundaries around year-keywords.
  const out = parseSiblingBasicsAnswer({
    userMessage: 'I have 7 children',
    lastNanaProse: NANA_ASKED_YEAR,
  })
  assert.equal(out.child_year, null)
})

// ── Codex r7 P2.2 — bare pronouns gated on gender context ────────────

test('parser: bare "she" extracts girl WHEN prior Nana asked about gender', () => {
  const out = parseSiblingBasicsAnswer({
    userMessage: 'she',
    lastNanaProse: NANA_ASKED_GENDER_ONLY,
  })
  assert.equal(out.child_gender, 'girl')
})

test('parser: bare "he" / "him" extract boy WHEN prior Nana asked about gender', () => {
  for (const input of ['he', 'him']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_GENDER_ONLY,
    })
    assert.equal(out.child_gender, 'boy', `failed on "${input}"`)
  }
})

test('parser: bare "she" / "he" / "him" do NOT extract gender when Nana did not ask about gender', () => {
  // Critical false-positive guard. A parent answering an interests-
  // focus turn might say "she does ballet" — that's NOT a gender
  // declaration. Without context gating, the parser would overwrite
  // a possibly-already-correct gender.
  for (const input of ['she', 'he', 'him', 'she does ballet', 'he loves rugby']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: 'tell me what yoyo loves doing outside class',
    })
    assert.equal(out.child_gender, null, `should not mis-fire on "${input}"`)
  }
})

test('parser: bare pronouns with NO prior Nana prose → null', () => {
  for (const input of ['she', 'he', 'him']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: null,
    })
    assert.equal(out.child_gender, null, `should not fire without context: "${input}"`)
  }
})

// ── Codex r7 NIT.1 — Y 9 (with space) variants ─────────────────────

test('parser: "Y 9" with space extracts year-9 (Codex r7 NIT.1)', () => {
  // Earlier regex only matched "y9" / "Y9" (no space). Codex caught
  // that "Y 9" with a space fell through. The fix swaps `y9` for
  // `y\s*9` so both forms work.
  for (const input of ['Y 9', 'y 9', 'Y 10', 'y 10', 'Y 7', 'y 7']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    // The expected value: strip the year number and convert to enum.
    const num = input.match(/\d+/)[0]
    const expected = `year-${num}`
    assert.equal(out.child_year, expected, `failed on "${input}"`)
  }
})

test('parser: "Y 12" / "Y 13" with space extract sixth-form (Codex r7 NIT.1)', () => {
  for (const input of ['Y 12', 'y 12', 'Y 13', 'y 13']) {
    const out = parseSiblingBasicsAnswer({
      userMessage: input,
      lastNanaProse: NANA_ASKED_YEAR,
    })
    assert.equal(out.child_year, 'sixth-form', `failed on "${input}"`)
  }
})
