import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } =
  localBrowser('duplicates')
try {
  login()
  open('/dashboard')
  drop([
    ['index.html', '<html>Duplicate fixture</html>'],
    ['a.txt', 'same'],
    ['b.txt', 'same'],
    ['c.txt', 'different'],
  ])
  browser('click', '.quick-deploy-controls .deploy-button')
  browser('wait', '.deploy-success')
  const slug = evaluate('document.querySelector("[name=site-slug]").value')
  open(`/dashboard/sites/${slug}/inspect`)
  const report = evaluate(
    'Array.from(document.querySelectorAll("details")).find(e=>e.querySelector("summary")?.textContent.startsWith("Duplicate assets"))?.textContent',
  )
  assert.ok(report.includes('1 groups'))
  assert.ok(report.includes('4 repeated bytes'))
  assert.ok(report.includes('a.txt') && report.includes('b.txt'))
  assert.ok(!report.includes('c.txt'))
  console.log(
    'Real uploaded checksums identify only identical non-empty assets.',
  )
} finally {
  close()
}
