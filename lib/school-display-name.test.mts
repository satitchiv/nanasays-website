import assert from 'node:assert/strict'
import test from 'node:test'
import {
  disambiguateSchoolDisplayName,
  schoolLocalityLabel,
  schoolNamePrefixKey,
  schoolNameSearchPrefix,
} from './school-display-name.ts'

test('prefix key keeps St Pauls together and does not collapse Kingswood into Kings', () => {
  assert.equal(schoolNamePrefixKey("St Paul's School"), 'st paul')
  assert.equal(schoolNamePrefixKey("St Paul's Girls' School"), 'st paul')
  assert.equal(schoolNamePrefixKey("King's College School Wimbledon"), 'king')
  assert.equal(schoolNamePrefixKey('Kingswood School'), 'kingswood')
})

test('search prefix preserves user-facing first word while escaping SQL wildcards', () => {
  assert.equal(schoolNameSearchPrefix("King's College School Wimbledon"), "King's")
  assert.equal(schoolNameSearchPrefix('Wellington College'), 'Wellington')
})

// Codex r2 P2-3 + r3 Q5: leading "The" must be stripped so "The King's School"
// queries "King's%" instead of "The%", matching the leading-article handling
// in normaliseSchoolNameTokens. Otherwise cross-"The" collisions miss. Solo
// "The" returns null (degenerate input — no useful prefix).
test('search prefix skips a leading "The" so cross-"The" collisions are findable', () => {
  assert.equal(schoolNameSearchPrefix("The King's School Canterbury"), "King's")
  assert.equal(schoolNameSearchPrefix('The Perse School'), 'Perse')
  // Solo "The" (degenerate input) — no useful prefix.
  assert.equal(schoolNameSearchPrefix('The'), null)
  assert.equal(schoolNameSearchPrefix('the'), null)
})

test('disambiguates Wellington collision with county-level label', () => {
  const peers = [
    { slug: 'wellington-school', name: 'Wellington School', city: 'Altrincham', region: 'Somerset' },
  ]
  assert.equal(
    disambiguateSchoolDisplayName(
      { slug: 'wellington-college', name: 'Wellington College', city: 'Crowthorne', region: 'Berkshire' },
      peers,
    ),
    'Wellington College — Berkshire',
  )
})

test('falls back from generic England region to city for London schools', () => {
  const school = {
    slug: 'kings-college-school-wimbledon',
    name: "King's College School Wimbledon",
    city: 'London',
    region: 'England',
  }
  assert.equal(schoolLocalityLabel(school), 'London')
  assert.equal(
    disambiguateSchoolDisplayName(school, [
      { slug: 'kings-school-canterbury', name: "King's School Canterbury", city: 'Canterbury', region: 'Kent' },
    ]),
    "King's College School Wimbledon — London",
  )
})

test('uses slug-derived London when report metadata has no city or region', () => {
  assert.equal(
    disambiguateSchoolDisplayName(
      { slug: 'st-pauls-school-london', name: "St Paul's School", city: null, region: null },
      [{ slug: 'st-pauls-girls-school', name: "St Paul's Girls' School", city: 'London', region: 'London' }],
    ),
    "St Paul's School — London",
  )
})

test('leaves unique school names untouched', () => {
  assert.equal(
    disambiguateSchoolDisplayName(
      { slug: 'eton-college', name: 'Eton College', city: 'Windsor', region: 'Berkshire' },
      [{ slug: 'harrow-school', name: 'Harrow School', city: 'London', region: 'London' }],
    ),
    'Eton College',
  )
})
