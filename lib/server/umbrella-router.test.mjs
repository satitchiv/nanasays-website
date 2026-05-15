import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { detectUmbrellas, unionIsiDeepFactTypes, unionProfileFields, detectComparisonTarget, _canonicalSlugBase } from './umbrella-router.js'

describe('detectUmbrellas — pastoral / wellbeing phrasings (P0.1 fix, 2026-05-14)', () => {
  // Closes smoke finding #2 (2026-05-14 nana-smoke-comprehensive): parents
  // asking "pastoral support" / "student wellbeing" / "wellbeing support"
  // hit no umbrella before this fix and chat fell back to chunk-only retrieval
  // + pastoral_model school marketing. Fix: extend `safety` umbrella triggers
  // with the root forms 'pastoral' / 'wellbeing' / 'well-being' / 'welfare'
  // so includes()-substring match catches all the parent phrasings.

  test('"pastoral support" fires safety umbrella', () => {
    assert.ok(detectUmbrellas('What is the pastoral support like here?').includes('safety'))
  })

  test('"student wellbeing" fires safety umbrella', () => {
    assert.ok(detectUmbrellas('How does the school handle student wellbeing?').includes('safety'))
  })

  test('"wellbeing support" fires safety umbrella', () => {
    assert.ok(detectUmbrellas('Tell me about wellbeing support.').includes('safety'))
  })

  test('"pastoral care" fires safety umbrella', () => {
    assert.ok(detectUmbrellas('Is the pastoral care any good?').includes('safety'))
  })

  test('"student welfare" fires safety umbrella', () => {
    assert.ok(detectUmbrellas('What about student welfare provisions?').includes('safety'))
  })

  test('"well-being" hyphenated form fires safety umbrella', () => {
    assert.ok(detectUmbrellas('How is student well-being prioritised?').includes('safety'))
  })

  test('non-pastoral safety phrasings still fire (regression)', () => {
    assert.ok(detectUmbrellas('Are kids safe online here?').includes('safety'))
    assert.ok(detectUmbrellas('Any bullying concerns?').includes('safety'))
    assert.ok(detectUmbrellas('Mental health support?').includes('safety'))
  })

  test('unrelated question does not fire safety umbrella', () => {
    assert.ok(!detectUmbrellas('What are the A-level grades like?').includes('safety'))
    assert.ok(!detectUmbrellas('Tell me about the rugby programme.').includes('safety'))
  })

  test('safety match loads pastoral_care + wellbeing_staffing profile fields', () => {
    const umbrellas = detectUmbrellas('Tell me about the wellbeing programme')
    const fields = unionProfileFields(umbrellas)
    assert.ok(fields.includes('pastoral_care'), 'pastoral_care should be in unioned fields')
    assert.ok(fields.includes('wellbeing_staffing'), 'wellbeing_staffing should be in unioned fields')
    assert.ok(fields.includes('pastoral_model'), 'pastoral_model should also be in unioned fields')
  })

  test('safety match loads ISI bullying + mental_health + online_safety + wellbeing_spaces fact types', () => {
    const umbrellas = detectUmbrellas('How is the pastoral support here?')
    const factTypes = unionIsiDeepFactTypes(umbrellas)
    assert.ok(factTypes.includes('isi_bullying_culture'))
    assert.ok(factTypes.includes('isi_mental_health_provision'))
    assert.ok(factTypes.includes('isi_online_safety_education'))
    assert.ok(factTypes.includes('isi_wellbeing_spaces'))
  })
})

describe('detectComparisonTarget (N3, 2026-05-15)', () => {
  // Parent-battery targets P15/P26/P29 motivate N3. The injected `resolveSlugs`
  // stub stands in for the production pipeline (detectMentionedSlugs +
  // expandFamousShortNames). We do not load nana-brain.js here — that would
  // pull in the entire LLM stack just to test a regex + filter.

  const resolveSlugs = (slugs) => async () => slugs

  test('P15 phrasing "cheaper than Eton" fires and returns eton-college (host filtered out)', async () => {
    const out = await detectComparisonTarget(
      'Is this school cheaper than Eton?',
      'charterhouse-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })

  test('P26 phrasing "compare to Eton" fires', async () => {
    const out = await detectComparisonTarget(
      'How does this school compare to Eton?',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })

  test('P29 phrasing "different from Sevenoaks" fires', async () => {
    const out = await detectComparisonTarget(
      'How is this school different from Sevenoaks?',
      'tonbridge-school',
      null,
      { resolveSlugs: resolveSlugs(['sevenoaks-school']) },
    )
    assert.equal(out, 'sevenoaks-school')
  })

  test('filters host slug when both host and target appear in resolved candidates', async () => {
    const out = await detectComparisonTarget(
      'How does Harrow compare to Eton?',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['harrow-school', 'eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })

  test('caps at one target — first non-host slug wins (host-vs-one only)', async () => {
    const out = await detectComparisonTarget(
      'Compare this to Eton and Harrow.',
      'charterhouse-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college', 'harrow-school']) },
    )
    assert.equal(out, 'eton-college')
  })

  test('returns null when no comparison pattern matches', async () => {
    const out = await detectComparisonTarget(
      'Tell me about the rugby programme.',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) }, // would resolve, but pattern absent
    )
    assert.equal(out, null)
  })

  test('returns null when comparison pattern fires but no non-host school is named (P27 case)', async () => {
    // "Is this school actually better than my local state grammar?" — pattern
    // hits "better than" but no DB slug resolves. Must return null so the
    // comparison block does not render with an empty target.
    const out = await detectComparisonTarget(
      'Is this school actually better than my local state grammar?',
      'ashford-school',
      null,
      { resolveSlugs: resolveSlugs([]) },
    )
    assert.equal(out, null)
  })

  test('returns null when only the host slug is resolved (no real target)', async () => {
    const out = await detectComparisonTarget(
      'How does Harrow compare to itself last year?',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['harrow-school']) },
    )
    assert.equal(out, null)
  })

  test('handles empty / whitespace / non-string questions gracefully', async () => {
    assert.equal(await detectComparisonTarget('', 'x', null), null)
    assert.equal(await detectComparisonTarget('   ', 'x', null), null)
    assert.equal(await detectComparisonTarget(null, 'x', null), null)
    assert.equal(await detectComparisonTarget(undefined, 'x', null), null)
  })

  test('does NOT fire on bare "different" without from/to/than (e.g. "different teachers each year")', async () => {
    const out = await detectComparisonTarget(
      'Do they have different teachers each year?',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) },
    )
    assert.equal(out, null)
  })

  test('"compare" inside a longer word ("comparable") does not fire', async () => {
    // \b boundaries keep "comparable" from triggering — "comparable" the word
    // has no trailing \b after the 'e' before 'le', but the regex anchors
    // either at end-of-token or with the explicit suffix `d?`. Verify the
    // false-positive guard holds.
    const out = await detectComparisonTarget(
      'Are their A-levels comparable to other schools?',
      'harrow-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) },
    )
    assert.equal(out, null)
  })

  test('case-insensitive matching', async () => {
    const out = await detectComparisonTarget(
      'IS THIS SCHOOL CHEAPER THAN ETON?',
      'charterhouse-school',
      null,
      { resolveSlugs: resolveSlugs(['eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })

  // Codex r1 P1 (2026-05-15): host-alias collision regression.
  test('host alias collision: host=charterhouse-school + candidate=charterhouse → filter both, return next', async () => {
    // FAMOUS_SHORT_NAMES maps "charterhouse" → 'charterhouse' (no -school
    // suffix) but the Next.js report page route uses 'charterhouse-school'.
    // Without the canonical-base filter, the bare alias would slip past and
    // detectComparisonTarget would return 'charterhouse' even though it's
    // the same school as the host. Verify the canonical-base filter catches it.
    const out = await detectComparisonTarget(
      'Is Charterhouse cheaper than Eton?',
      'charterhouse-school',
      null,
      { resolveSlugs: resolveSlugs(['charterhouse', 'eton-college']) },
    )
    assert.equal(out, 'eton-college', 'host alias must be filtered before returning')
  })

  test('host alias collision: host=bedales + candidate=bedales-school → also filtered', async () => {
    // Reverse direction — host slug already lacks suffix, candidate has it.
    const out = await detectComparisonTarget(
      'How does Bedales compare to Eton?',
      'bedales',
      null,
      { resolveSlugs: resolveSlugs(['bedales-school', 'eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })

  test('_canonicalSlugBase strips -school | -college | -uk suffix (with stacked-suffix loop, Codex r2 P2)', () => {
    assert.equal(_canonicalSlugBase('charterhouse-school'), 'charterhouse')
    assert.equal(_canonicalSlugBase('eton-college'), 'eton')
    // Stacked terminal suffixes collapse to base via loop (was single-strip in r1)
    assert.equal(_canonicalSlugBase('reeds-school-uk'), 'reeds')
    assert.equal(_canonicalSlugBase('westminster-school-uk'), 'westminster')
    assert.equal(_canonicalSlugBase('charterhouse'), 'charterhouse')   // already canonical
    assert.equal(_canonicalSlugBase('kings-school-canterbury'), 'kings-school-canterbury') // doesn't strip mid-slug
    assert.equal(_canonicalSlugBase(''), '')
    assert.equal(_canonicalSlugBase(null), '')
    assert.equal(_canonicalSlugBase(undefined), '')
  })

  test('host alias collision: host=reeds-school-uk + candidate=reeds → filter via stacked-suffix canonicalization', async () => {
    // Codex r2 P2 follow-up: stacked-suffix loop in canonicalSlugBase means
    // reeds-school-uk collapses to 'reeds' and the bare alias is filtered.
    const out = await detectComparisonTarget(
      'How does Reeds compare to Eton?',
      'reeds-school-uk',
      null,
      { resolveSlugs: resolveSlugs(['reeds', 'eton-college']) },
    )
    assert.equal(out, 'eton-college')
  })
})
