// 2026-05-14 v3 — Slice 8 Step 0.7: rowTopic() unit tests
//
// Runs with:
//   node --experimental-strip-types --test \
//     lib/server/research-room/row-topic.test.mjs
//
// v3 additions for Codex r2 P1 #8 (strict dmt) + r2 NIT #9
// (send/activities/destinations tightening).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rowTopic,
  isSportTopic,
  isAcademicTopic,
  isArtsTopic,
  isPastoralTopic,
} from './row-topic.ts'

// ── Sports ──────────────────────────────────────────────────────────────

test('rowTopic: rugby labels return "rugby"', () => {
  assert.equal(rowTopic('Rugby strength'), 'rugby')
  assert.equal(rowTopic('Rugby ranking (DMT / SOCS)'), 'rugby')
  assert.equal(rowTopic('1st XV record'), 'rugby')
  assert.equal(rowTopic('Recent rugby success'), 'rugby')
})

// r3 P1 #3: dmt now uses a 40-char lookahead for rank/ranking, so
// "DMT current rank" / "DMT 3-year rank" / "DMT season rank" match,
// while bare "DMT-style" still rejects.
test('rowTopic v5: dmt requires whitespace after + rank/ranking within 40 chars (r4 NIT #1)', () => {
  // POSITIVE — dmt followed by whitespace + rank within 40 chars
  assert.equal(rowTopic('DMT rank'), 'rugby')
  assert.equal(rowTopic('DMT ranking'), 'rugby')
  assert.equal(rowTopic('DMT current rank'), 'rugby')
  assert.equal(rowTopic('DMT 3-year rank'), 'rugby')
  assert.equal(rowTopic('DMT season rank'), 'rugby')
  // POSITIVE — rugby-context anywhere in label
  assert.equal(rowTopic('Rugby DMT analysis'), 'rugby')
  // NEGATIVE — Codex r1-r4 named regressions
  assert.equal(rowTopic('Some DMT-style comparison'), 'other')
  assert.equal(rowTopic('DMT-style metrics'), 'other')
  assert.equal(rowTopic('A bare DMT mention'), 'other')
  // NEGATIVE — r4 NIT #1: hyphenated forms with rank elsewhere must NOT match
  assert.equal(rowTopic('DMT-related rank promotion'), 'other')
  assert.equal(rowTopic('DMT-flavoured rank table'), 'other')
})

test('rowTopic: tennis labels return "tennis"', () => {
  assert.equal(rowTopic('Tennis programme strength'), 'tennis')
  assert.equal(rowTopic('Number of tennis teams'), 'tennis')
})

test('rowTopic: cricket / hockey / football each get distinct topics', () => {
  assert.equal(rowTopic('Cricket pathway'), 'cricket')
  assert.equal(rowTopic('Hockey 1st XI'), 'hockey')
  assert.equal(rowTopic('Football competitive level'), 'football')
})

test('rowTopic: rowing / swimming / equestrian / netball / athletics', () => {
  assert.equal(rowTopic('Rowing club'), 'rowing')
  assert.equal(rowTopic('Regatta record'), 'rowing')
  assert.equal(rowTopic('Swimming squad'), 'swimming')
  assert.equal(rowTopic('Equestrian programme'), 'equestrian')
  assert.equal(rowTopic('Netball 1st VII'), 'netball')
  assert.equal(rowTopic('Athletics record'), 'athletics')
  assert.equal(rowTopic('Track and field facilities'), 'athletics')
})

test('rowTopic: sport-other fires on explicit sport-context tokens only', () => {
  assert.equal(rowTopic('Sport facilities'), 'sport-other')
  assert.equal(rowTopic('Sports department'), 'sport-other')
  assert.equal(rowTopic('Sport scholarship'), 'sport-other')
  assert.equal(rowTopic('Director of sport'), 'sport-other')
  assert.equal(rowTopic('Physical Education'), 'sport-other')
  assert.equal(rowTopic('PE programme'), 'sport-other')
})

// ── False-positive guards (r2 NIT #9 + earlier) ────────────────────────

test('rowTopic v3: bare "team" / "field" / "play" do not false-positive', () => {
  assert.equal(rowTopic('Team building day'), 'other')
  assert.equal(rowTopic('Senior leadership team'), 'other')
  assert.equal(rowTopic('Field trip programme'), 'other')
  assert.equal(rowTopic('Playground area'), 'other')
  assert.equal(rowTopic('Play area'), 'other')
})

test('rowTopic v3: "School play" matches drama (specific phrase only)', () => {
  assert.equal(rowTopic('School play'), 'drama')
  assert.equal(rowTopic('School plays per year'), 'drama')
})

// ── Critical invariant ────────────────────────────────────────────────

test('rowTopic separates rugby from tennis (Build 4 invariant)', () => {
  assert.notEqual(rowTopic('Rugby strength'), rowTopic('Tennis programme strength'))
})

// ── Academic ──────────────────────────────────────────────────────────

test('rowTopic: academic-results captures GCSE / A-level / IB grades', () => {
  assert.equal(rowTopic('GCSE A*-A %'), 'academics-results')
  assert.equal(rowTopic('A-level A*-A %'), 'academics-results')
  assert.equal(rowTopic('IB average score'), 'academics-results')
})

test('rowTopic: oxbridge separated from generic results', () => {
  assert.equal(rowTopic('Oxbridge offers'), 'oxbridge')
  assert.equal(rowTopic('Oxford and Cambridge entry'), 'oxbridge')
})

test('rowTopic: "Oxbridge maths preparation" prefers oxbridge over STEM', () => {
  assert.equal(rowTopic('Oxbridge maths preparation'), 'oxbridge')
})

test('rowTopic: STEM vs humanities distinction', () => {
  assert.equal(rowTopic('Maths department'), 'academics-stem')
  assert.equal(rowTopic('Sciences breadth'), 'academics-stem')
  assert.equal(rowTopic('Humanities offering'), 'academics-humanities')
  assert.equal(rowTopic('Languages offered'), 'academics-humanities')
})

// ── v3 tightened patterns (r2 NIT #9) ──────────────────────────────────

test('rowTopic v3: "send" verb does not false-positive into send-learning-support', () => {
  // POSITIVE — acronym OR support-context
  assert.equal(rowTopic('SEND provision'), 'send-learning-support')
  assert.equal(rowTopic('SEND coordinator'), 'send-learning-support')
  assert.equal(rowTopic('SEN coordinator'), 'send-learning-support')
  assert.equal(rowTopic('Dyslexia support'), 'send-learning-support')
  assert.equal(rowTopic('EAL programme'), 'send-learning-support')
  assert.equal(rowTopic('Learning support team'), 'send-learning-support')
  // NEGATIVE — verb usage. r3 P2 #10: "Send registration to admissions"
  // correctly matches admissions topic (the admissions regex fires
  // first). The send-learning-support verb-guard still works because
  // its regex doesn't match bare verb. Use clean negative cases below.
  assert.equal(rowTopic('Send us your enquiry'), 'other')
  assert.equal(rowTopic('Send the form to reception'), 'other')
  assert.equal(rowTopic('Send registration to admissions'), 'admissions')
})

test('rowTopic v3: bare "destinations" does not steal travel/commute rows', () => {
  // POSITIVE — university/leaver context
  assert.equal(rowTopic('Year 13 leavers'), 'leavers-destinations')
  assert.equal(rowTopic('University destinations'), 'leavers-destinations')
  assert.equal(rowTopic('University placement record'), 'leavers-destinations')
  assert.equal(rowTopic('Destinations after Year 13'), 'leavers-destinations')
  assert.equal(rowTopic('Leaver destinations'), 'leavers-destinations')
  // NEGATIVE — bare "destination" without leaver/university context
  assert.equal(rowTopic('Travel destinations from station'), 'commute')
})

test('rowTopic v3: bare "activities" does not steal boarding/weekend rows', () => {
  // POSITIVE — co-curricular context
  assert.equal(rowTopic('Co-curricular programme'), 'co-curricular')
  assert.equal(rowTopic('Extra-curricular clubs'), 'co-curricular')
  assert.equal(rowTopic('Co-curricular activities'), 'co-curricular')
  assert.equal(rowTopic('Activities programme'), 'co-curricular')
  assert.equal(rowTopic('Number of clubs'), 'co-curricular')
  assert.equal(rowTopic('Debating Society'), 'co-curricular')
  // NEGATIVE — boarding-context "activities" stays in boarding
  assert.equal(rowTopic('Weekend boarding activities'), 'boarding')
})

// ── Other new topics ──────────────────────────────────────────────────

test('rowTopic: faith / ethos', () => {
  assert.equal(rowTopic('Church of England ethos'), 'faith-ethos')
  assert.equal(rowTopic('CofE foundation'), 'faith-ethos')
  assert.equal(rowTopic('Catholic school'), 'faith-ethos')
  assert.equal(rowTopic('Quaker tradition'), 'faith-ethos')
  assert.equal(rowTopic('School chapel'), 'faith-ethos')
  assert.equal(rowTopic('Secular environment'), 'faith-ethos')
  assert.equal(rowTopic('Multi-faith approach'), 'faith-ethos')
})

test('rowTopic: outdoor / CCF', () => {
  assert.equal(rowTopic('CCF programme'), 'outdoor-ccf')
  assert.equal(rowTopic('Combined Cadet Force'), 'outdoor-ccf')
  assert.equal(rowTopic('Duke of Edinburgh'), 'outdoor-ccf')
  assert.equal(rowTopic('DofE participation'), 'outdoor-ccf')
  assert.equal(rowTopic('Outdoor education'), 'outdoor-ccf')
  assert.equal(rowTopic('Expedition record'), 'outdoor-ccf')
})

test('rowTopic: diversity / inclusion', () => {
  assert.equal(rowTopic('Diversity statement'), 'diversity-inclusion')
  assert.equal(rowTopic('Inclusion policy'), 'diversity-inclusion')
  assert.equal(rowTopic('EDI provision'), 'diversity-inclusion')
  assert.equal(rowTopic('LGBTQ+ support'), 'diversity-inclusion')
})

test('rowTopic: discipline / behaviour', () => {
  assert.equal(rowTopic('Behaviour policy'), 'discipline-behaviour')
  assert.equal(rowTopic('Discipline framework'), 'discipline-behaviour')
  assert.equal(rowTopic('Code of conduct'), 'discipline-behaviour')
  assert.equal(rowTopic('Recent exclusions'), 'discipline-behaviour')
})

// ── Lifestyle ─────────────────────────────────────────────────────────

test('rowTopic: boarding-related rows return "boarding"', () => {
  assert.equal(rowTopic('Boarding ratio'), 'boarding')
  assert.equal(rowTopic('House system'), 'boarding')
  assert.equal(rowTopic('Weekend programme'), 'boarding')
})

test('rowTopic: ISI / safeguarding distinct from pastoral', () => {
  assert.equal(rowTopic('ISI inspection compliance'), 'safeguarding')
  assert.equal(rowTopic('Safeguarding policy'), 'safeguarding')
  assert.equal(rowTopic('Pastoral care'), 'pastoral')
  assert.equal(rowTopic('Tutor system'), 'pastoral')
})

test('rowTopic: "Boarding scholarship" → scholarships', () => {
  assert.equal(rowTopic('Boarding scholarship'), 'scholarships')
})

test('rowTopic: "Pastoral house" → pastoral', () => {
  assert.equal(rowTopic('Pastoral house'), 'pastoral')
})

test('rowTopic: "Music scholarship" → music', () => {
  // Music regex runs before scholarships, so this stays music for
  // topic scoring (matches Codex r1 recommendation).
  assert.equal(rowTopic('Music scholarship'), 'music')
})

test('rowTopic: fees vs scholarships distinction', () => {
  assert.equal(rowTopic('Boarding fee · per year'), 'fees')
  assert.equal(rowTopic('Registration fee'), 'fees')
  assert.equal(rowTopic('Bursary cap'), 'scholarships')
  assert.equal(rowTopic('Means-tested awards'), 'scholarships')
})

// ── Arts ──────────────────────────────────────────────────────────────

test('rowTopic: music / drama / visual arts each get distinct topics', () => {
  assert.equal(rowTopic('Music ensembles'), 'music')
  assert.equal(rowTopic('Choir performance'), 'music')
  assert.equal(rowTopic('Drama programme'), 'drama')
  assert.equal(rowTopic('Theatre productions'), 'drama')
  assert.equal(rowTopic('Visual art studios'), 'visual-arts')
  assert.equal(rowTopic('Art gallery'), 'visual-arts')
})

// ── Helpers ───────────────────────────────────────────────────────────

test('isSportTopic returns true for all sport topics', () => {
  for (const t of ['rugby', 'tennis', 'cricket', 'hockey', 'football',
                   'netball', 'rowing', 'swimming', 'equestrian',
                   'athletics', 'sport-other']) {
    assert.equal(isSportTopic(t), true, `${t} should be a sport topic`)
  }
})

test('isSportTopic returns false for non-sport topics', () => {
  for (const t of ['boarding', 'fees', 'pastoral', 'oxbridge', 'music', 'other']) {
    assert.equal(isSportTopic(t), false, `${t} should NOT be a sport topic`)
  }
})

test('isAcademicTopic / isArtsTopic / isPastoralTopic membership is exclusive', () => {
  assert.equal(isAcademicTopic('academics-stem'), true)
  assert.equal(isAcademicTopic('rugby'), false)
  assert.equal(isArtsTopic('music'), true)
  assert.equal(isArtsTopic('academics-stem'), false)
  assert.equal(isPastoralTopic('pastoral'), true)
  assert.equal(isPastoralTopic('safeguarding'), true)
  assert.equal(isPastoralTopic('wellbeing'), true)
  assert.equal(isPastoralTopic('discipline-behaviour'), true)
  assert.equal(isPastoralTopic('rugby'), false)
})

// ── Catch-all ─────────────────────────────────────────────────────────

test('rowTopic: unknown labels fall through to "other"', () => {
  assert.equal(rowTopic('Random unrelated label'), 'other')
  assert.equal(rowTopic('Some Mystery Cell'), 'other')
})
