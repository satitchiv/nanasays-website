// Slice 8 Build 2 r4 — canonical-json unit tests.
//
// Asserts the invariants Codex r4 P3 called out:
//   - "same cells in different key order compare equal"
//   - "missing/undefined optional fields normalize the same way the DB
//      write does"
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/research-room/canonical-json.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson } from './canonical-json.ts'

test('primitives: nulls, numbers, strings, booleans', () => {
  assert.equal(canonicalJson(null),     'null')
  assert.equal(canonicalJson(undefined), 'null')
  assert.equal(canonicalJson(0),         '0')
  assert.equal(canonicalJson(42),        '42')
  assert.equal(canonicalJson(true),      'true')
  assert.equal(canonicalJson(false),     'false')
  assert.equal(canonicalJson('hello'),   '"hello"')
})

test('object key order does NOT affect output (the core jsonb invariant)', () => {
  const a = { foo: 1, bar: 2 }
  const b = { bar: 2, foo: 1 }
  assert.equal(canonicalJson(a), canonicalJson(b))
  assert.equal(canonicalJson(a), '{"bar":2,"foo":1}')
})

test('nested object key order is also normalized recursively', () => {
  const a = { outer: { x: 1, y: 2 }, top: true }
  const b = { top: true, outer: { y: 2, x: 1 } }
  assert.equal(canonicalJson(a), canonicalJson(b))
})

test('arrays preserve their index order (semantic)', () => {
  assert.notEqual(canonicalJson([1, 2, 3]), canonicalJson([3, 2, 1]))
  assert.equal(canonicalJson([1, 2, 3]), '[1,2,3]')
})

test('cell_data shape: a real-world spec.cell_data round-trip is stable', () => {
  // Mirrors the shape seed-rows.ts builds:
  //   { slug1: { value, source?, note? }, slug2: ... }
  // App-built order:
  const appBuilt = {
    'bromsgrove-school': { value: 'National-strong', source: 'sports_profile.rugby' },
    'oakham-school':     { value: 'National',        source: 'sports_profile.rugby' },
  }
  // Postgres jsonb might return keys in any order:
  const dbReturned = {
    'oakham-school':     { source: 'sports_profile.rugby', value: 'National' },
    'bromsgrove-school': { source: 'sports_profile.rugby', value: 'National-strong' },
  }
  assert.equal(canonicalJson(appBuilt), canonicalJson(dbReturned))
})

test('undefined object values are dropped (matches JSON.stringify)', () => {
  const a = { foo: 1, bar: undefined }
  const b = { foo: 1 }
  assert.equal(canonicalJson(a), canonicalJson(b))
  assert.equal(canonicalJson(a), '{"foo":1}')
})

test('null vs missing key produce DIFFERENT output (jsonb stores null literally)', () => {
  // This mirrors jsonb behavior: {note: null} and {} are different
  // values on a Postgres jsonb round-trip. canonicalJson must preserve
  // this so we don't false-skip when the spec drops a key the row has.
  const withNull   = { value: 'X', note: null }
  const withoutKey = { value: 'X' }
  assert.notEqual(canonicalJson(withNull), canonicalJson(withoutKey))
})

test('empty object and empty array produce distinct canonical forms', () => {
  assert.equal(canonicalJson({}), '{}')
  assert.equal(canonicalJson([]), '[]')
  assert.notEqual(canonicalJson({}), canonicalJson([]))
})

test('strings with special characters are JSON-escaped', () => {
  assert.equal(canonicalJson('a "quoted" b'), '"a \\"quoted\\" b"')
  assert.equal(canonicalJson('line\nfeed'),    '"line\\nfeed"')
})

test('mixed nested array of objects: full canonicalization', () => {
  const a = {
    rows: [
      { z: 9, a: 1 },
      { b: 2, y: 8 },
    ],
    meta: { ts: 12345, name: 'x' },
  }
  const b = {
    meta: { name: 'x', ts: 12345 },
    rows: [
      { a: 1, z: 9 },
      { y: 8, b: 2 },
    ],
  }
  assert.equal(canonicalJson(a), canonicalJson(b))
})
