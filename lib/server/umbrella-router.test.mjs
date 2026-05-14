import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { detectUmbrellas, unionIsiDeepFactTypes, unionProfileFields } from './umbrella-router.js'

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
