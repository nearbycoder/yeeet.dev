import assert from 'node:assert/strict'
import test from 'node:test'
import { currentHealthPassed } from '../src/lib/launch-checklist'

test('launch checklist requires a recent successful check of the current build', () => {
  const now = Date.now(),
    health = {
      deploymentId: 'current',
      checkedAt: new Date(now - 1000),
      responseStatus: 200,
      expectedStatus: 200,
      error: null,
    }
  assert.equal(currentHealthPassed(health, 'current', now), true)
  assert.equal(currentHealthPassed(health, 'new-version', now), false)
  assert.equal(
    currentHealthPassed(
      { ...health, checkedAt: new Date(now - 16 * 60000) },
      'current',
      now,
    ),
    false,
  )
  assert.equal(
    currentHealthPassed({ ...health, error: 'failed' }, 'current', now),
    false,
  )
  assert.equal(
    currentHealthPassed(
      { ...health, checkedAt: new Date(now + 1) },
      'current',
      now,
    ),
    false,
  )
  assert.equal(currentHealthPassed(null, null, now), false)
})
