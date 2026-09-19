import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('changes')
try {
  login()
  open('/dashboard')
  drop(
    Array.from({ length: 205 }, (_, i) => [
      `asset-${String(i).padStart(3, '0')}.txt`,
      'fixture',
    ]),
  )
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Review changes',
    '--exact',
  )
  browser('wait', '.manifest-diff')
  assert.equal(
    evaluate(
      'document.querySelectorAll(".manifest-diff .file-paths li").length',
    ),
    100,
  )
  browser('focus', '.manifest-diff details summary')
  browser('press', 'Enter')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Show more added files',
    '--exact',
  )
  assert.equal(
    evaluate(
      'document.querySelectorAll(".manifest-diff .file-paths li").length',
    ),
    200,
  )
  browser('fill', '.manifest-diff input[type=search]', 'asset-204')
  assert.equal(
    evaluate(
      'document.querySelectorAll(".manifest-diff .file-paths li").length',
    ),
    1,
  )
  assert.equal(
    evaluate(
      'document.querySelector(".manifest-diff .site-metrics strong").textContent',
    ),
    '205',
  )
  browser('fill', '.manifest-diff input[type=search]', 'no-match')
  browser('wait', '--text', 'No paths match this search.')
  console.log(
    'Change lists are bounded, expandable, and searchable without changing totals.',
  )
} finally {
  close()
}
