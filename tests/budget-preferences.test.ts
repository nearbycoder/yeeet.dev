import assert from 'node:assert/strict'
import test from 'node:test'
import {
  budgetPreferencesSchema,
  budgetStorageKey,
} from '../src/lib/budget-preferences'

test('saved budgets validate limits and isolate site/account keys', () => {
  for (const value of [0, -1, Infinity, NaN, 0.5, 1048577])
    assert.equal(
      budgetPreferencesSchema.safeParse({ fileKiB: value, totalMiB: 10 })
        .success,
      false,
    )
  assert.equal(
    budgetPreferencesSchema.safeParse({ fileKiB: 1, totalMiB: 1048576 })
      .success,
    true,
  )
  assert.notEqual(budgetStorageKey('a', 'site'), budgetStorageKey('b', 'site'))
  assert.notEqual(budgetStorageKey('a', 'site'), budgetStorageKey('a', 'other'))
  assert.notEqual(budgetStorageKey('a:b', 'c'), budgetStorageKey('a', 'b:c'))
})
