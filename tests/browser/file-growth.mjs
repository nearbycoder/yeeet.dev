import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('growth')
try {
  login()
  open('/dashboard')
  const index = '<html>Growth fixture</html>'
  drop([
    ['index.html', index],
    ['grow.txt', 'a'.repeat(10)],
    ['shrink.txt', 'b'.repeat(30)],
    ['remove.txt', 'c'.repeat(40)],
  ])
  browser('click', '.quick-deploy-controls .deploy-button')
  browser('wait', '.deploy-success')
  const slug = evaluate('document.querySelector("[name=site-slug]").value')
  const base = evaluate(
    `(async()=>{const r=await fetch('/api/v1/sites/${slug}/versions');return (await r.json()).versions[0].id})()`,
  )
  open(`/dashboard?site=${slug}`)
  drop([
    ['index.html', index],
    ['grow.txt', 'a'.repeat(20)],
    ['shrink.txt', 'b'.repeat(10)],
    ['add.txt', 'd'.repeat(100)],
  ])
  browser('click', '.quick-deploy-controls .deploy-button')
  browser('wait', '.deploy-success')
  open(`/dashboard/sites/${slug}/inspect?base=${base}`)
  browser('focus', 'details[aria-label="File size changes"] > summary')
  browser('press', 'Enter')
  assert.ok(
    evaluate(
      `document.querySelector('details[aria-label="File size changes"] summary').textContent`,
    ).includes('+50 B net'),
  )
  assert.equal(
    evaluate(
      `document.querySelectorAll('details[aria-label="File size changes"] tbody tr').length`,
    ),
    2,
  )
  browser(
    'uncheck',
    'details[aria-label="File size changes"] input[type=checkbox]',
  )
  assert.equal(
    evaluate(
      `document.querySelectorAll('details[aria-label="File size changes"] tbody tr').length`,
    ),
    4,
  )
  assert.ok(
    evaluate(
      `document.querySelector('details[aria-label="File size changes"] tbody').textContent`,
    ).includes('-40 B'),
  )
  console.log(
    'Real version comparison identifies growth, reductions, and the correct net size.',
  )
} finally {
  close()
}
