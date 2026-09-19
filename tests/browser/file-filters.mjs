import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('filters')
try {
  login()
  open('/dashboard')
  drop([
    ['index.html', '<html>Filter fixture</html>'],
    ['a.txt', 'one'],
    ['b.txt', 'two'],
  ])
  browser('click', '.quick-deploy-controls .deploy-button')
  browser('wait', '.deploy-success')
  const slug = evaluate('document.querySelector("[name=site-slug]").value')
  open(`/dashboard/sites/${slug}/inspect`)
  browser(
    'fill',
    'section[aria-label="File explorer"] input[type=search]',
    'a.txt',
  )
  browser(
    'select',
    'section[aria-label="File explorer"] select >> nth=0',
    'HTML',
  )
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Bookmark these file filters',
    '--exact',
  )
  browser('wait', '--fn', 'location.search.includes("fileQuery")')
  const url = evaluate('location.href')
  assert.ok(new URL(url).searchParams.get('version'))
  open(url)
  assert.equal(
    evaluate(
      `document.querySelector('section[aria-label="File explorer"] input[type=search]').value`,
    ),
    'a.txt',
  )
  assert.equal(
    evaluate(
      `document.querySelectorAll('section[aria-label="File explorer"] tbody tr').length`,
    ),
    1,
  )
  console.log(
    'Bookmarked file filters restore after reopening and pin the exact version.',
  )
} finally {
  close()
}
