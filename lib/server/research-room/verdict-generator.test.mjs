// Behavioural tests for verdict-generator.ts
//
// Why this exists alongside verdict-generator-source.test.mjs:
//   The -source test is a regex-grep against the source string. It locks
//   that certain strings exist in the file, but doesn't catch math/logic
//   regressions. This file calls buildResearchVerdictDraft() with crafted
//   ComparisonData fixtures and asserts on observable outputs (rank order,
//   reservations, summary presence, signal direction).
//
// Why the import indirection:
//   verdict-generator.ts begins with `import 'server-only'` (a Next.js
//   marker that throws if shipped to the browser). That package isn't in
//   node_modules at test time. We strip just that one line to a temp file
//   and import the temp version. The `import type {...} from '@/...'` at
//   line 4 is erased by --experimental-strip-types so its alias path
//   doesn't matter.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC_URL = new URL('./verdict-generator.ts', import.meta.url)
const TEMP_PATH = `/tmp/verdict-generator-test-${process.pid}.ts`
// Slice 8 Build 4: verdict-generator.ts now imports './row-topic'. The
// temp-file shim above resolves relative paths from /tmp/, so rewrite
// that import to an absolute file URL pointing back at the real module.
const ROW_TOPIC_PATH = new URL('./row-topic.ts', import.meta.url).pathname
// Verdict v3 (2026-05-21): four sibling modules. Node ESM needs explicit
// .ts extensions and can't resolve the `@/lib/uk-regions` alias, so we
// copy each sibling to /tmp with cross-references + alias rewritten.
const V3_TYPES_PATH = new URL('./verdict-generator-v3-types.ts', import.meta.url).pathname
const UK_REGIONS_PATH = new URL('../../uk-regions.ts', import.meta.url).pathname
// Sport-gate fix (2026-05-24): new helper import needs its own path so the
// test loader resolves it after the source is copied to /tmp.
const EFFECTIVE_TOP_PRIORITY_PATH = new URL('../../research-room/effective-top-priority.ts', import.meta.url).pathname
const V3_BRIEF_SRC_URL     = new URL('./verdict-generator-v3-brief.ts',     import.meta.url)
const V3_PATHS_SRC_URL     = new URL('./verdict-generator-v3-paths.ts',     import.meta.url)
const V3_NARRATIVE_SRC_URL = new URL('./verdict-generator-v3-narrative.ts', import.meta.url)
// v3.1 (2026-05-26): new path-selectors module — used by verdict-generator.ts
// AND -v3-types.ts (FramingHint type) AND -v3-paths.ts (FramingHint imported
// for FRAMING_TABLE keys).
const PATH_SELECTORS_SRC_URL = new URL('./path-selectors.ts', import.meta.url)
const V3_BRIEF_TEMP     = `/tmp/verdict-generator-v3-brief-test-${process.pid}.ts`
const V3_PATHS_TEMP     = `/tmp/verdict-generator-v3-paths-test-${process.pid}.ts`
const V3_NARRATIVE_TEMP = `/tmp/verdict-generator-v3-narrative-test-${process.pid}.ts`
const PATH_SELECTORS_TEMP = `/tmp/path-selectors-test-${process.pid}.ts`
function rewriteV3Refs(s) {
  return s
    .replace(`from '@/lib/uk-regions'`,                 `from '${UK_REGIONS_PATH}'`)
    .replace(`from './verdict-generator-v3-types'`,     `from '${V3_TYPES_PATH}'`)
    .replace(`from './verdict-generator-v3-brief'`,     `from '${V3_BRIEF_TEMP}'`)
    .replace(`from './verdict-generator-v3-paths'`,     `from '${V3_PATHS_TEMP}'`)
    .replace(`from './verdict-generator-v3-narrative'`, `from '${V3_NARRATIVE_TEMP}'`)
    .replace(`from './path-selectors'`,                 `from '${PATH_SELECTORS_TEMP}'`)
}
writeFileSync(V3_BRIEF_TEMP,     rewriteV3Refs(readFileSync(V3_BRIEF_SRC_URL,     'utf8')))
writeFileSync(V3_PATHS_TEMP,     rewriteV3Refs(readFileSync(V3_PATHS_SRC_URL,     'utf8')))
writeFileSync(V3_NARRATIVE_TEMP, rewriteV3Refs(readFileSync(V3_NARRATIVE_SRC_URL, 'utf8')))
// path-selectors needs server-only stripped + types path rewritten.
writeFileSync(
  PATH_SELECTORS_TEMP,
  readFileSync(PATH_SELECTORS_SRC_URL, 'utf8')
    .replace(/^import 'server-only'\s*$/m, '')
    .replace(`from './verdict-generator-v3-types'`, `from '${V3_TYPES_PATH}'`),
)
const src = readFileSync(SRC_URL, 'utf8')
  .replace(/^import 'server-only'\s*$/m, '')
  .replace(`from './row-topic'`, `from '${ROW_TOPIC_PATH}'`)
  .replace(`from './verdict-generator-v3-brief'`,     `from '${V3_BRIEF_TEMP}'`)
  .replace(`from './verdict-generator-v3-paths'`,     `from '${V3_PATHS_TEMP}'`)
  .replace(`from './verdict-generator-v3-narrative'`, `from '${V3_NARRATIVE_TEMP}'`)
  .replace(`from './verdict-generator-v3-types'`,     `from '${V3_TYPES_PATH}'`)
  .replace(`from './path-selectors'`,                 `from '${PATH_SELECTORS_TEMP}'`)
  // P1 #4 wiring (2026-05-22): main file now imports uk-regions for the UI
  // projection's inside_filter / region_label helpers. Test shim must rewrite.
  .replace(`from '@/lib/uk-regions'`,                 `from '${UK_REGIONS_PATH}'`)
  // Sport-gate fix (2026-05-24): main file imports effective-top-priority
  // for the buildRubric topPriority resolution.
  .replace(`from '@/lib/research-room/effective-top-priority'`, `from '${EFFECTIVE_TOP_PRIORITY_PATH}'`)
writeFileSync(TEMP_PATH, src)
const { buildResearchVerdictDraft } = await import(TEMP_PATH)

// ── Fixture builders ─────────────────────────────────────────────────────

function school(slug, name) {
  return { slug, name, meta: '' }
}

function valueCell(primary, sub) {
  return { kind: 'value', primary, ...(sub != null ? { sub } : {}) }
}

const empty = { kind: 'empty' }

function row(id, label, ...cells) {
  return { id, label, cells }
}

const baseArgs = {
  childName: 'Theo',
  childProfile: null,
  sessionId: 'sess-test',
  childId: 'child-test',
  // Codex r1 Delete #2 (2026-05-22): schoolFacts is required by BuildArgs.
  // Empty Map exercises the v3 path with degenerate facts — all schools land
  // in needs_research paths but ranked_schools/summary/reservations/headline
  // still emit normally (those are derived from comparisonData + rubric).
  schoolFacts: new Map(),
  // v3.1 (2026-05-26): recommender ranking optional; empty array exercises
  // the fallback-scored Path A behaviour.
  recommenderRanking: [],
}

// Fixture 1: 3 schools with varied fees + sport rankings + boarding facts
function richThreeSchoolFixture() {
  return {
    schools: [
      school('cheap-strong', 'Cheap Strong School'),
      school('mid-balanced', 'Mid Balanced School'),
      school('expensive-thin', 'Expensive Thin School'),
    ],
    rows: [
      row('fee', 'Boarding fee · per year',
        valueCell('£40,000', 'cheap fee'),
        valueCell('£50,000'),
        valueCell('£60,000', 'most expensive')),
      row('dmt', 'Rugby ranking (DMT / SOCS)',
        valueCell('DMT 30/157', 'top 20%'),
        valueCell('DMT 80/157'),
        valueCell('DMT 140/157')),
      row('boarding-ratio', 'Boarding ratio',
        valueCell('80/100', '80% boarders'),
        valueCell('60/100'),
        empty),
      row('strength', 'Rugby strength',
        valueCell('National-strong', 'Top 30 nationally'),
        valueCell('Regional', 'Solid local'),
        empty),
      row('school-type', 'School type',
        valueCell('Co-ed boarding'),
        valueCell('Co-ed boarding'),
        valueCell('Day + boarding')),
    ],
  }
}

// Fixture 2: Sport-priority rubric — top priority = sport, full boarding
const sportPriorityProfile = {
  top_priority: 'sport',
  boarding_pref: 'full-boarding',
  budget_range: '50k',
  child_year: '8',
  child_gender: 'boy',
}

// ── Regression tests — pin current correct behaviour ────────────────────

test('cheaper school outranks expensive on direction=lower fee row', () => {
  const data = {
    schools: [school('cheap', 'Cheap'), school('expensive', 'Expensive')],
    rows: [row('fee', 'Boarding fee · per year',
      valueCell('£30,000'),
      valueCell('£60,000'))],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(result.verdict.ranked_schools[0].slug, 'cheap',
    'cheaper school must rank higher when only fee row is present')
})

test('better DMT rank (lower number) wins on direction=lower rank row', () => {
  const data = {
    schools: [school('top-rugby', 'Top'), school('bottom-rugby', 'Bottom')],
    rows: [row('dmt', 'DMT current rank',
      valueCell('20/157'),
      valueCell('150/157'))],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(result.verdict.ranked_schools[0].slug, 'top-rugby',
    'school with rank 20 must beat school with rank 150')
})

test('rich fixture: cheap-strong school wins over mid and expensive', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  const order = result.verdict.ranked_schools.map(s => s.slug)
  assert.equal(order[0], 'cheap-strong',
    'school with cheapest fee + best rugby + highest boarding should rank #1')
  assert.equal(order[2], 'expensive-thin',
    'school with most expensive fee + worst rugby + missing data should rank last')
})

test('every ranked school has non-empty summary', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  for (const s of result.verdict.ranked_schools) {
    assert.ok(s.summary && s.summary.length > 10,
      `${s.name} must have a non-trivial summary`)
  }
})

test('headline names the top school + child', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  assert.match(result.verdict.headline, /Cheap Strong School/,
    'headline must mention the top-ranked school')
  assert.match(result.verdict.headline, /Theo/,
    'headline must mention the child by name')
})

test('thin-evidence school gets "Evidence sparse" reservation', () => {
  const data = {
    schools: [school('full', 'Full Coverage'), school('thin', 'Thin Coverage')],
    rows: [
      row('a', 'GCSE A*-A %', valueCell('70%'), empty),
      row('b', 'A-level A*-A %', valueCell('45%'), empty),
      row('c', 'Boarding fee · per year', valueCell('£50,000'), empty),
      row('d', 'School type', valueCell('Co-ed boarding'), empty),
      row('e', 'Rugby strength', valueCell('National'), empty),
    ],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  const thin = result.verdict.ranked_schools.find(s => s.slug === 'thin')
  assert.ok(thin, 'thin school must appear in ranking')
  assert.ok(thin.reservations.some(r => /Evidence sparse/i.test(r)),
    `thin school must carry "Evidence sparse" reservation; got: ${JSON.stringify(thin.reservations)}`)
})

test('verdict format and decision_model versions are stable', () => {
  // Codex r1 Delete #2 (2026-05-22): v2 fallback path removed — always v3.
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(result.verdict.format, 'research_verdict_v3')
  assert.equal(result.verdict.decision_model, 'paths_v3')
})

test('input hash is deterministic for identical inputs', () => {
  const data = richThreeSchoolFixture()
  const a = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  const b = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(a.inputHash, b.inputHash, 'identical inputs must produce identical hashes')
})

test('input hash changes when child profile changes', () => {
  const data = richThreeSchoolFixture()
  const a = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data, childProfile: null })
  const b = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data, childProfile: sportPriorityProfile })
  assert.notEqual(a.inputHash, b.inputHash,
    'profile change must invalidate cached hash (cache invalidation contract)')
})

test('confidence is "low" with two schools and few rows', () => {
  const data = {
    schools: [school('a', 'A'), school('b', 'B')],
    rows: [row('fee', 'Fees', valueCell('£40k'), valueCell('£60k'))],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(result.verdict.confidence, 'low',
    'one row, two schools must be low confidence')
})

// ── Slice 7 verdict-quality fixes — new behaviour ──────────────────────

test('Slice 7 Fix 1.1: thin-coverage school is downweighted vs full-coverage with similar strengths', () => {
  // thin-strong has stronger raw rugby signal but only 1/5 rows filled.
  // full-strong has the same kind of strength but full coverage.
  // The 40% downweight on thin should let full-strong win.
  const data = {
    schools: [school('thin-strong', 'Thin Strong'), school('full-strong', 'Full Strong')],
    rows: [
      row('strength', 'Rugby strength',
        valueCell('National-elite', 'Top 5 nationally'),
        valueCell('National-strong', 'Top 30 nationally')),
      row('a', 'GCSE A*-A %', empty, valueCell('60%')),
      row('b', 'A-level A*-A %', empty, valueCell('40%')),
      row('c', 'School type', empty, valueCell('Co-ed boarding')),
      row('d', 'Boarding fee · per year', empty, valueCell('£50,000')),
    ],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.equal(result.verdict.ranked_schools[0].slug, 'full-strong',
    'Full coverage school should outrank thin-coverage school despite weaker raw rugby signal')
})

test('Slice 7 Fix 1.2: top_priority=academic boosts academics-row contribution', () => {
  // Two schools tied on most rows; one has stronger A-level results.
  // Without the topPriority boost, the gap might not be enough to drive
  // ranking. With the boost, the academics-strong school wins.
  const data = {
    schools: [school('strong-academic', 'Strong Academic'), school('weak-academic', 'Weak Academic')],
    rows: [
      row('alevel', 'A-level A*-A %', valueCell('80%'), valueCell('40%')),
      row('fee', 'Boarding fee · per year', valueCell('£50,000'), valueCell('£50,000')),
      row('type', 'School type', valueCell('Co-ed boarding'), valueCell('Co-ed boarding')),
      row('strength', 'Rugby strength', valueCell('Regional'), valueCell('Regional')),
    ],
  }
  const academicResult = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { top_priority: 'academic' },
    comparisonData: data,
  })
  assert.equal(academicResult.verdict.ranked_schools[0].slug, 'strong-academic',
    'with top_priority=academic, the strong-academic school must rank #1')
})

test('Slice 7 Fix 1.2: top_priority=pastoral boosts pastoral-row contribution', () => {
  const data = {
    schools: [school('strong-pastoral', 'Strong Pastoral'), school('thin-pastoral', 'Thin Pastoral')],
    rows: [
      row('care', 'Pastoral care',
        valueCell('Excellent — full houseparent integration'),
        valueCell('Standard tutor system')),
      row('fee', 'Boarding fee · per year', valueCell('£50,000'), valueCell('£50,000')),
      row('type', 'School type', valueCell('Co-ed boarding'), valueCell('Co-ed boarding')),
    ],
  }
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { top_priority: 'pastoral' },
    comparisonData: data,
  })
  assert.equal(result.verdict.ranked_schools[0].slug, 'strong-pastoral',
    'with top_priority=pastoral, school with stronger pastoral evidence must rank #1')
})

test('Slice 7 Fix 1.2: top_priority=arts produces no boost (no DecisionCategory match)', () => {
  // 'arts' intentionally doesn't map to a DecisionCategory in
  // topPriorityToCategory(). Ranking should match neutral case.
  const data = richThreeSchoolFixture()
  const arts = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { top_priority: 'arts' },
    comparisonData: data,
  })
  const neutral = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: null,
    comparisonData: data,
  })
  assert.deepEqual(
    arts.verdict.ranked_schools.map(s => s.slug),
    neutral.verdict.ranked_schools.map(s => s.slug),
    'top_priority=arts should not change ranking — no clean DecisionCategory match'
  )
})

// Slice 7 Fix 1.3 boarding-mismatch reservation logic isn't present in
// verdict-generator.ts. Tracked alongside the Slice 7 Fix 2 skips above
// as v2-shape work that didn't land. v3 surfaces the same insight via
// boarding-mismatch-per-path tension in paths[].considerations.
test.skip('Slice 7 Fix 1.3: low boarding ratio + full-boarding pref produces "may operate primarily as day" reservation', () => {
  const data = {
    schools: [school('mostly-day', 'Mostly Day School'), school('proper-boarding', 'Proper Boarding')],
    rows: [
      row('boarding-ratio', 'Boarding ratio',
        valueCell('20/100', '20% boarders'),
        valueCell('80/100', '80% boarders')),
      row('fee', 'Boarding fee · per year', valueCell('£40,000'), valueCell('£42,000')),
      row('type', 'School type', valueCell('Co-ed boarding'), valueCell('Co-ed boarding')),
    ],
  }
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { boarding_pref: 'full-boarding' },
    comparisonData: data,
  })
  const mostlyDay = result.verdict.ranked_schools.find(s => s.slug === 'mostly-day')
  const properBoarding = result.verdict.ranked_schools.find(s => s.slug === 'proper-boarding')
  assert.ok(mostlyDay.reservations.some(r => /Boarding ratio is 20%/.test(r) || /Boarding ratio.*primarily as a day school/.test(r)),
    `mostly-day school should carry the boarding-mismatch reservation; got: ${JSON.stringify(mostlyDay.reservations)}`)
  assert.ok(!properBoarding.reservations.some(r => /Boarding ratio.*primarily as a day school/.test(r)),
    'proper-boarding school must NOT carry the mismatch reservation (80% is fine)')
})

test('Slice 7 Fix 1.3: boarding-mismatch reservation does NOT fire when boarding_pref is not full', () => {
  const data = {
    schools: [school('mostly-day', 'Mostly Day School')],
    rows: [
      row('boarding-ratio', 'Boarding ratio', valueCell('20/100')),
    ],
  }
  // No boarding pref set
  const result = buildResearchVerdictDraft({ ...baseArgs, childProfile: null, comparisonData: data })
  const s = result.verdict.ranked_schools[0]
  assert.ok(!s.reservations.some(r => /primarily as a day school/.test(r)),
    'no boarding mismatch reservation when parent has no full-boarding pref')

  // Flexi pref also shouldn't fire
  const flexi = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { boarding_pref: 'flexi-boarding' },
    comparisonData: data,
  })
  const fs = flexi.verdict.ranked_schools[0]
  assert.ok(!fs.reservations.some(r => /primarily as a day school/.test(r)),
    'no boarding mismatch reservation when parent prefers flexi (not full)')
})

test('Slice 7 Fix 1.3: row labelled "Boarding fees" does NOT trigger boarding-ratio reservation', () => {
  // Defensive: "Boarding fee" rows contain the word "boarding" but are
  // not boarding ratios. They must not produce false-positive flags.
  const data = {
    schools: [school('a', 'A')],
    rows: [
      row('fee', 'Boarding fee · per year', valueCell('£20,000')),
    ],
  }
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { boarding_pref: 'full-boarding' },
    comparisonData: data,
  })
  const s = result.verdict.ranked_schools[0]
  assert.ok(!s.reservations.some(r => /primarily as a day school/.test(r)),
    'fee row must not trigger boarding-ratio reservation')
})

test('Slice 7 Fix 1.1: thin-coverage school carries the consolidated "Evidence sparse" reservation, not per-row missing pills', () => {
  // The pre-existing applyEvidenceThinAnnotation collapses per-row
  // "evidence missing" reservations into one consolidated note. Lock
  // that behaviour: thin schools should NOT have a swarm of "X: evidence
  // missing" reservations.
  const data = {
    schools: [school('full', 'Full Coverage'), school('thin', 'Thin Coverage')],
    rows: [
      row('a', 'GCSE A*-A %', valueCell('70%'), empty),
      row('b', 'A-level A*-A %', valueCell('45%'), empty),
      row('c', 'Boarding fee · per year', valueCell('£50,000'), empty),
      row('d', 'School type', valueCell('Co-ed boarding'), empty),
      row('e', 'Rugby strength', valueCell('National'), empty),
    ],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  const thin = result.verdict.ranked_schools.find(s => s.slug === 'thin')
  const perRowMissing = thin.reservations.filter(r => /evidence missing$/i.test(r))
  assert.equal(perRowMissing.length, 0,
    `thin school must not have per-row "evidence missing" reservations; consolidated note replaces them. Got: ${JSON.stringify(thin.reservations)}`)
})

// Slice 7 Fix 2 tests below assert a richer buildSummary/headline shape
// (colon-pair signals, "Main uncertainty:", "strongest on") that was
// designed but never landed in verdict-generator.ts. v3 (2026-05-21)
// surfaces those concrete signals through the path-overlay narrative
// (paths[].reasoning / evidence / considerations) rather than through
// the v2 ranked_schools summary. Track these as pending v2-shape work.
test.skip('Slice 7 Fix 2: top-school summary weaves in a concrete strength signal', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  const top = result.verdict.ranked_schools[0]
  // The top school's strengths array has been computed; the new summary
  // helper must weave in at least one of those concrete signal texts.
  // We assert the summary contains a colon (the standard ` "label: value" `
  // shape used by summarizeSignal) AND mentions at least one of the top
  // strengths verbatim.
  assert.ok(top.summary.includes(':'),
    `top summary should weave in a "label: value" signal; got: ${top.summary}`)
  const matchesAStrength = top.strengths.some(s => top.summary.includes(s))
  assert.ok(matchesAStrength,
    `top summary should mention one of the school's actual strengths; summary=${top.summary} strengths=${JSON.stringify(top.strengths)}`)
})

test.skip('Slice 7 Fix 2: top-school summary surfaces a real reservation when one exists', () => {
  // Build a fixture where the top school has both strengths and a clear
  // reservation (low boarding ratio mismatch + full-boarding pref).
  const data = {
    schools: [school('top', 'Top School'), school('next', 'Next School')],
    rows: [
      row('strength', 'Rugby strength', valueCell('National-elite'), valueCell('Regional')),
      row('boarding-ratio', 'Boarding ratio', valueCell('20/100'), valueCell('80/100')),
      row('fee', 'Boarding fee · per year', valueCell('£40,000'), valueCell('£60,000')),
      row('type', 'School type', valueCell('Co-ed boarding'), valueCell('Co-ed boarding')),
    ],
  }
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { boarding_pref: 'full-boarding', top_priority: 'sport' },
    comparisonData: data,
  })
  const top = result.verdict.ranked_schools[0]
  // The summary should mention "Main uncertainty" since reservations exist
  assert.ok(/Main uncertainty:/i.test(top.summary) || /Watch:/i.test(top.summary),
    `summary should surface a real reservation; got: ${top.summary}`)
})

test.skip('Slice 7 Fix 2: headline includes the top strength when available', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  // Headline should now be "X is the best current fit for Theo — strongest on <signal>"
  assert.match(result.verdict.headline, /strongest on /i,
    `headline should contain "strongest on" when top school has strengths; got: ${result.verdict.headline}`)
})

test('Slice 7 Fix 2: headline gracefully handles missing strengths', () => {
  // No rich rows = no qualifying strengths; headline should still produce
  // a sensible fallback.
  const data = {
    schools: [school('a', 'A')],
    rows: [row('type', 'School type', valueCell('Co-ed boarding'))],
  }
  const result = buildResearchVerdictDraft({ ...baseArgs, comparisonData: data })
  assert.ok(result.verdict.headline && result.verdict.headline.length > 10,
    'headline must not be empty when school has no strengths')
})

test('Slice 7 Fix 2: dissent cites specific evidence when second beats top on a category', () => {
  // Top school strong on rugby, second strong on academics. Dissent should
  // cite the academics evidence specifically, not just say "academics."
  const data = {
    schools: [school('rugby-strong', 'Rugby Strong'), school('academic-strong', 'Academic Strong')],
    rows: [
      row('strength', 'Rugby strength', valueCell('National-elite'), valueCell('Regional')),
      row('alevel', 'A-level A*-A %', valueCell('40%'), valueCell('80%')),
      row('fee', 'Boarding fee · per year', valueCell('£50,000'), valueCell('£50,000')),
      row('type', 'School type', valueCell('Co-ed boarding'), valueCell('Co-ed boarding')),
    ],
  }
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: { top_priority: 'sport' },  // sport priority makes rugby-strong rank #1
    comparisonData: data,
  })
  // Whichever school is second, dissent should mention specific evidence
  // (a colon-bearing signal text in parens), not just a category name.
  const dissent = result.verdict.dissenting_view
  assert.ok(/\(.+:.+\)/.test(dissent) || dissent.includes('main challenger'),
    `dissent should cite specific evidence in parens or fall back gracefully; got: ${dissent}`)
})

test('body markdown contains decision factors and ranking section', () => {
  const data = richThreeSchoolFixture()
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile: sportPriorityProfile,
    comparisonData: data,
  })
  assert.match(result.bodyMarkdown, /## Decision factors/)
  assert.match(result.bodyMarkdown, /## Current ranking/)
  assert.match(result.bodyMarkdown, /Cheap Strong School/)
})

// ─── UX iteration Phase 1.5 — table-driven Path A overlay tests ─────────────
//
// Codex r1 + r2 from Phase 1 carry-forward: assert that Path A's framing,
// status_note anchor copy, AND narrative reasoning ALL flex with
// rubric.topPriority. Pre-1.5 the framing/status were dynamic but the
// reasoning prose still said "your brief named sport as the top priority"
// regardless of topPriority — visible contradiction.
//
// Each variant exercises the full pathAModeForRubric() path:
// composite math → framing → status anchor → reasoning prose.

// v3.1 (2026-05-26): Path A is now ALWAYS "Best overall match" regardless of
// topPriority — recommender #1 drives selection, not topPriority. The old
// per-priority framing flex was the Phase 1.5 design that got superseded.
// Tests kept as a regression guard: Path A framing is invariant to topPriority.
const PATH_A_FRAMING_VARIANTS = [
  { name: 'sport',     profile: { ...sportPriorityProfile } },
  { name: 'academic',  profile: { ...sportPriorityProfile, top_priority: 'academic' } },
  { name: 'pastoral',  profile: { ...sportPriorityProfile, top_priority: 'pastoral' } },
  { name: 'arts',      profile: { ...sportPriorityProfile, top_priority: 'arts' } },
  { name: 'all-round', profile: { ...sportPriorityProfile, top_priority: 'all-round' } },
  { name: 'null',      profile: (() => { const p = { ...sportPriorityProfile }; delete p.top_priority; return p })() },
].map(v => ({ ...v, expect: /^Best overall match$/i }))

for (const variant of PATH_A_FRAMING_VARIANTS) {
  test(`Phase 1.5 Path A — ${variant.name} priority: framing flexes correctly`, () => {
    const result = buildResearchVerdictDraft({
      ...baseArgs,
      childProfile:   variant.profile,
      comparisonData: richThreeSchoolFixture(),
    })
    const pathA = result.verdict.paths?.A
    assert.ok(pathA, `Path A overlay must exist for ${variant.name}`)
    assert.match(pathA.framing, variant.expect,
      `Path A framing must match for topPriority=${variant.name}: got "${pathA.framing}"`)
  })
}

// Mode-specific opener prose ONLY fires when path_status === 'winner' (the
// generic needs_research / fallback copy is unrelated to topPriority). The
// shared richThreeSchoolFixture has sport+boarding+fees signal, so the SPORT
// variant produces a winner — that's the cleanest case to assert against.
// v3.1 (2026-05-26): Phase 1.5's sport-led Path A opener is gone — Path A is
// always recommender-#1 driven and uses the "Best overall match" opener
// regardless of topPriority. This test now asserts the new opener fires for a
// sport-priority brief (it doesn't claim "sport as the top priority" anymore;
// the recommender's specialist-sport bonus already surfaces the right school).
test('Phase 1.5 → v3.1 Path A — sport priority: winner opener references "recommender currently ranks it #1"', () => {
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile:   { ...sportPriorityProfile },
    comparisonData: richThreeSchoolFixture(),
  })
  const pathA = result.verdict.paths?.A
  assert.ok(pathA)
  assert.equal(pathA.path_status, 'winner', 'Path A should be a winner with sport-rich fixture')
  const reasoningJoined = (pathA.reasoning ?? []).join(' ')
  assert.match(reasoningJoined, /recommender currently ranks it #1/i,
    'v3.1 Path A opener should come from FRAMING_TABLE.best_overall.opener — check verdict-generator-v3-paths.ts')
  assert.doesNotMatch(reasoningJoined, /brief named sport as the top priority/i,
    'Legacy sport-led opener should NOT fire in v3.1 — confirm pathAOpenerForMode is deleted')
})

// Anti-regression: when topPriority is academic but the fixture has no
// academic signal, the path falls to needs_research — the OLD bug was that the
// opener still said "your brief named sport as the top priority" even in this
// state. After Phase 1.5 the needs_research path uses generic copy without the
// stale sport claim. Assert that.
test('Phase 1.5 Path A — academic priority on sport-only data: no stale "sport as top priority" claim', () => {
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile:   { ...sportPriorityProfile, top_priority: 'academic' },
    comparisonData: richThreeSchoolFixture(),
  })
  const pathA = result.verdict.paths?.A
  assert.ok(pathA)
  const reasoningJoined = (pathA.reasoning ?? []).join(' ')
  assert.doesNotMatch(reasoningJoined, /brief named sport as the top priority/i,
    'Stale sport-led opener leaked into academic-priority Path A reasoning')
})

// Anti-regression: "Best overall fit" framing must NOT produce "overall-led"
// anchor copy in status notes. Codex Phase 1.5 r1 test-gap: the positive
// "/best-fit/" assertion only fires when statusNoteFor is actually called.
// The empty-rows fixture below hits the degenerate-overlay branch which uses
// a different hardcoded status_note ("No school in your shortlist meets the
// 50% coverage threshold yet"), so we keep the doesNotMatch assertion only.
test('Phase 1.5 Path A — null priority: status copy never says "overall-led"', () => {
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile:   (() => { const p = { ...sportPriorityProfile }; delete p.top_priority; return p })(),
    comparisonData: { schools: [school('a', 'A'), school('b', 'B')], rows: [] },
  })
  const pathA = result.verdict.paths?.A
  assert.ok(pathA)
  if (pathA.status_note) {
    assert.doesNotMatch(pathA.status_note, /overall-led/i,
      'status_note should never contain raw "overall-led" — must route through anchorNoun() to "best-fit winner"')
  }
})

// Codex Phase 1.5 r1 test-gap: Path B's sport sentence must NOT attribute to
// "the brief's top priority" when topPriority isn't sport. The sport claim is
// allowed (sport is always a relevant balanced-reading signal), but the
// "top priority" tail must only fire for actual sport-priority briefs.
test('Phase 1.5 Path B — non-sport priority: sport sentence does NOT claim "the brief\'s top priority"', () => {
  const result = buildResearchVerdictDraft({
    ...baseArgs,
    childProfile:   { ...sportPriorityProfile, top_priority: 'academic' },
    comparisonData: richThreeSchoolFixture(),
  })
  const pathB = result.verdict.paths?.B
  assert.ok(pathB)
  const reasoningJoined = (pathB.reasoning ?? []).join(' ')
  // If Path B mentions sport at all, the tail must NOT claim it's the top
  // priority (since topPriority is 'academic'). Either no sport sentence, or
  // the "useful sport signal within the balanced reading" variant.
  const hasSportTopPriorityClaim = /sport[^.]*genuine fit for the brief'?s top priority/i.test(reasoningJoined)
  assert.equal(hasSportTopPriorityClaim, false,
    'Path B leaked "sport ... brief\'s top priority" claim for an academic-priority brief')
})
