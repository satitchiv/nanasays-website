import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalDatabaseTopicLabel } from './database-topic-candidates.ts'

test('maps several parent questions to one canonical database topic', () => {
  assert.equal(canonicalDatabaseTopicLabel('How many sports teams does the school have?'), 'Sports team depth')
  assert.equal(canonicalDatabaseTopicLabel('Which sports is the school known for?'), 'Signature sports')
  assert.equal(canonicalDatabaseTopicLabel('a completely new topic'), 'a completely new topic')
})
