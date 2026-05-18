// Run: node --test lib/server/named-school-scope-warning.test.mjs

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNamedSchoolScopeWarningFromSlugs } from './nana-brain.js'

const nameBySlug = new Map([
  ['wellington-college', 'Wellington College'],
  ['eton-college', 'Eton College'],
  ['harrow-school', 'Harrow School'],
])

test('warns when named comparison pair excludes the report host and one named school is missing', () => {
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'wellington-college',
    hostName: 'Wellington College',
    question: 'How does Eton compare to Harrow on academics?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug,
  })

  assert.match(warning, /Harrow School/)
  assert.match(warning, /outside this report scope/)
  assert.match(warning, /does not include the host school/)
  assert.match(warning, /do not turn the answer into a host-vs-target comparison/)
})

test('does not warn when all named schools are loaded', () => {
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'wellington-college',
    hostName: 'Wellington College',
    question: 'How does this school compare to Eton?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college'],
    nameBySlug,
  })

  assert.equal(warning, null)
})

test('warns for third-school spillover while preserving this-school comparison shape', () => {
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'wellington-college',
    hostName: 'Wellington College',
    question: 'How does this school compare to Eton and Harrow?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug,
  })

  assert.match(warning, /Harrow School/)
  assert.doesNotMatch(warning, /does not include the host school/)
})

// Codex r2 P2-2: when the parent names the host by its bare short name
// (e.g. "Wellington" → "Wellington College"), FAMOUS_SHORT_NAMES may not
// resolve it back to a slug, so mentionedSlugs misses the host. The host-
// name-in-question detector should still mark the host as implicitly named
// and suppress the "comparison pair does not include the host school" line.
test('does not claim host is excluded when parent names host by bare short name', () => {
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'wellington-college',
    hostName: 'Wellington College',
    question: 'How does Wellington compare to Eton and Harrow on academics?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug,
  })

  // Warning still fires for the missing Harrow data
  assert.match(warning, /Harrow School/)
  // But MUST NOT say the comparison pair excludes the host — the parent did
  // name "Wellington" in the question
  assert.doesNotMatch(warning, /does not include the host school/)
})

// Codex r3 P6-B: acronym host schools (LVS, AKS, RGS, KCS, BHS) — token-
// length filter dropped them in r2, leaving them with no usable token and
// re-misfiring the warning. Preserve all-caps acronyms length 2-3 (except
// generic "ST").
test('does not claim host is excluded when host is an acronym school (LVS Ascot)', () => {
  const acronymNameBySlug = new Map([
    ['lvs-ascot',    'LVS Ascot'],
    ['eton-college', 'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'lvs-ascot',
    hostName: 'LVS Ascot',
    question: 'How does LVS compare to Eton and Harrow?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: acronymNameBySlug,
  })
  assert.match(warning, /Harrow School/)
  assert.doesNotMatch(warning, /does not include the host school/)
})

// Codex r3 P6-B: generic gender tokens (boys, girls) must NOT count as the
// host being named. "Sherborne Girls" with a question about "girls" generally
// must still emit the host-excluded line.
test('still warns host-excluded when question mentions only generic "girls" (not Sherborne)', () => {
  const sherborneNameBySlug = new Map([
    ['sherborne-girls', 'Sherborne Girls'],
    ['eton-college',    'Eton College'],
    ['harrow-school',   'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'sherborne-girls',
    hostName: 'Sherborne Girls',
    question: 'Which is better for girls, Eton or Harrow?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: sherborneNameBySlug,
  })
  // Generic "girls" must NOT count as the host being named — host-excluded
  // line should still appear
  assert.match(warning, /does not include the host school/)
})

// Codex r4 P6-B: generic SCHOOL_STOP_WORDS tokens (international, royal,
// great, free, ...) must NOT count as the host being named. r3 missed these
// because the local stopword set was narrower than SCHOOL_STOP_WORDS.
test('still warns host-excluded when question only contains a SCHOOL_STOP_WORDS host token (international)', () => {
  const acsNameBySlug = new Map([
    ['acs-international-school-cobham', 'ACS International School Cobham'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'acs-international-school-cobham',
    hostName: 'ACS International School Cobham',
    question: 'How do Eton and Harrow compare for international pupils?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: acsNameBySlug,
  })
  // "international" alone must NOT count as the host being named — but the
  // ACS acronym should still be detectable if mentioned. Here only generic
  // tokens appear, so host-excluded warning must fire.
  assert.match(warning, /does not include the host school/)
})

test('still warns host-excluded when question only contains "royal" (host=Royal Hospital School)', () => {
  const royalNameBySlug = new Map([
    ['royal-hospital-school', 'Royal Hospital School'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'royal-hospital-school',
    hostName: 'Royal Hospital School',
    question: 'How do Eton and Harrow compare for royal navy families?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: royalNameBySlug,
  })
  // "royal" / "hospital" are generic — but wait, "hospital" is NOT in
  // SCHOOL_STOP_WORDS, so it COULD match. Let me think... actually for
  // Royal Hospital School the distinctive tokens after stripping the stop
  // words are "hospital" (length 8, kept). And "hospital" doesn't appear
  // in the question. So host should be marked excluded.
  assert.match(warning, /does not include the host school/)
})

// Codex r5 P6-B: locality tokens (city, london) added to extras + phrase-
// level check. Generic "city" doesn't mark host implicit, but the full
// "City of London" phrase appearing in the question does.
test('still warns host-excluded when question only contains generic "city" (host=City of London School)', () => {
  const colsNameBySlug = new Map([
    ['city-of-london-school', 'City of London School'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'city-of-london-school',
    hostName: 'City of London School',
    question: 'How do Eton and Harrow compare for city families?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: colsNameBySlug,
  })
  assert.match(warning, /does not include the host school/)
})

test('does NOT warn host-excluded when question contains the full "City of London" phrase', () => {
  const colsNameBySlug = new Map([
    ['city-of-london-school', 'City of London School'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'city-of-london-school',
    hostName: 'City of London School',
    question: 'How does City of London compare to Eton and Harrow on academics?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: colsNameBySlug,
  })
  // Warning still fires for missing Harrow
  assert.match(warning, /Harrow School/)
  // But NOT the host-excluded line — host was named by full phrase
  assert.doesNotMatch(warning, /does not include the host school/)
})

// Codex r6 P6-B: token matching must respect word boundaries. r5's bare
// `q.includes(phrase)` allowed substring matches — "Bradley" in the question
// wrongly satisfied the host-named check for Radley College.
test('host token check uses word boundaries — Bradley does NOT match Radley', () => {
  const radleyNameBySlug = new Map([
    ['radley-college', 'Radley College'],
    ['eton-college',   'Eton College'],
    ['harrow-school',  'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'radley-college',
    hostName: 'Radley College',
    question: 'How does Bradley compare to Eton and Harrow?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: radleyNameBySlug,
  })
  // "Bradley" must NOT count as the host (Radley) being named. Host-excluded
  // warning should still fire.
  assert.match(warning, /does not include the host school/)
})

// r6 follow-up: hyphenated host-name reference should still work
// (City-of-London → City of London after normalization)
test('does NOT warn host-excluded when question uses hyphenated host phrase', () => {
  const colsNameBySlug = new Map([
    ['city-of-london-school', 'City of London School'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'city-of-london-school',
    hostName: 'City of London School',
    question: 'How does City-of-London compare to Eton and Harrow?',
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: colsNameBySlug,
  })
  assert.doesNotMatch(warning, /does not include the host school/)
})

// Codex r7 P6-B: possessive host mentions ("City of London's results",
// "Wellington's fees") must count as the host being named. Apostrophes get
// stripped during normalization, so "London's" becomes "londons" — phrase
// regex now allows optional trailing `s`.
test('does NOT warn host-excluded when question uses possessive host name (phrase)', () => {
  const colsNameBySlug = new Map([
    ['city-of-london-school', 'City of London School'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'city-of-london-school',
    hostName: 'City of London School',
    question: "How do City of London's results compare to Eton and Harrow?",
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: colsNameBySlug,
  })
  assert.doesNotMatch(warning, /does not include the host school/)
})

test('does NOT warn host-excluded when question uses possessive host name (token)', () => {
  const wellingtonNameBySlug = new Map([
    ['wellington-college', 'Wellington College'],
    ['eton-college',  'Eton College'],
    ['harrow-school', 'Harrow School'],
  ])
  const warning = buildNamedSchoolScopeWarningFromSlugs({
    hostSlug: 'wellington-college',
    hostName: 'Wellington College',
    question: "How do Wellington's fees compare to Eton and Harrow?",
    comparisonSlug: 'eton-college',
    mentionedSlugs: ['eton-college', 'harrow-school'],
    nameBySlug: wellingtonNameBySlug,
  })
  assert.doesNotMatch(warning, /does not include the host school/)
})
