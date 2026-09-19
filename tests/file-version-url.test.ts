import assert from 'node:assert/strict'
import test from 'node:test'
import { fileVersionUrl } from '../src/lib/file-version-url'

test('file URLs preserve the exact version origin and encode reserved characters', () => {
  assert.equal(
    fileVersionUrl(
      'https://v-abc.example.com/?token=secret#x',
      'assets/a b?#%.svg',
    ),
    'https://v-abc.example.com/assets/a%20b%3F%23%25.svg',
  )
  assert.equal(
    fileVersionUrl('https://v-abc.example.com', '%2e%2e/x'),
    'https://v-abc.example.com/%252e%252e/x',
  )
  for (const path of ['../secret', '//evil.test/x', 'a/../b', 'a\\b'])
    assert.throws(() => fileVersionUrl('https://v-abc.example.com', path))
  assert.throws(() => fileVersionUrl('javascript:alert(1)', 'index.html'))
})
