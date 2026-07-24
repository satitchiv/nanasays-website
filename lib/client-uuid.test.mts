import assert from 'node:assert/strict'
import test from 'node:test'
import { createClientUuid } from './client-uuid.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test('uses randomUUID when the browser provides it', () => {
  const expected = '73463b66-cf3c-4e66-a284-62052ddf0f75'
  assert.equal(createClientUuid({ randomUUID: () => expected }), expected)
})

test('creates a valid UUID when randomUUID is unavailable on HTTP', () => {
  const value = createClientUuid({
    getRandomValues(bytes) {
      bytes.forEach((_, index) => {
        bytes[index] = index
      })
      return bytes
    },
  })
  assert.match(value, UUID_V4)
  assert.equal(value, '00010203-0405-4607-8809-0a0b0c0d0e0f')
})

test('still creates a valid UUID when Web Crypto is unavailable', () => {
  assert.match(createClientUuid(null), UUID_V4)
})
