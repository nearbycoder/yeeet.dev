import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseReadingPreferences,
  defaultReadingPreferences,
} from '../src/lib/reading-preferences'

test('reading preferences accept explicit booleans and recover from malformed browser storage', () => {
  for (const raw of [
    null,
    '{',
    '{}',
    '{"largeText":"true","reduceMotion":false}',
  ])
    assert.deepEqual(parseReadingPreferences(raw), defaultReadingPreferences)
  assert.deepEqual(
    parseReadingPreferences(
      '{"largeText":true,"reduceMotion":true,"extra":"ignored"}',
    ),
    { largeText: true, reduceMotion: true },
  )
})
