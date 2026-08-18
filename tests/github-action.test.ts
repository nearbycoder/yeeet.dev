import assert from 'node:assert/strict'
import test from 'node:test'
import { previewComment, previewSiteName } from '../github-action/index.mjs'

test('creates DNS-safe deterministic PR preview names', () => {
  assert.equal(previewSiteName('Cosmic Docs', 42), 'cosmic-docs-pr-42')
  const long = previewSiteName('a'.repeat(80), 12345)
  assert.equal(long.length, 63)
  assert.match(long, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/)
})

test('creates an idempotent marker for preview comments', () => {
  const first = previewComment({
    mode: 'deploy',
    site: 'docs-pr-8',
    url: 'https://docs-pr-8.site.yeeet.dev',
    versionUrl: 'https://v-example.site.yeeet.dev',
  })
  const cleanup = previewComment({
    mode: 'cleanup',
    site: 'docs-pr-8',
    url: undefined,
    versionUrl: undefined,
  })
  assert.match(first, /^<!-- yeeet-preview:docs-pr-8 -->/)
  assert.match(first, /Immutable version/)
  assert.match(cleanup, /^<!-- yeeet-preview:docs-pr-8 -->/)
  assert.match(cleanup, /removed/i)
})
