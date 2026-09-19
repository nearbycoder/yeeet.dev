import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('preview')
try {
  login()
  open('/dashboard')
  const source =
    '<html><script>window.previewExecuted=true</script>Preview fixture</html>'
  drop([['index.html', source]])
  browser('click', '.quick-deploy-controls .deploy-button')
  browser('wait', '.deploy-success')
  const slug = evaluate('document.querySelector("[name=site-slug]").value')
  assert.ok(slug)
  open(`/dashboard/sites/${slug}/inspect`)
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Preview index.html',
    '--exact',
  )
  browser('wait', '--text', 'UTF-8 source shown as plain text.')
  assert.equal(
    evaluate(
      'document.querySelector(".console-item pre.console-code").textContent',
    ),
    source,
  )
  assert.equal(evaluate('Boolean(window.previewExecuted)'), false)
  const version = evaluate(
    'document.querySelector(".site-page-panel .console-form-grid select").value',
  )
  assert.equal(
    evaluate(
      `(async()=>{const r=await fetch('/api/v1/sites/${slug}/versions/${version}/file?path=index.html',{credentials:'omit'});return r.status})()`,
    ),
    401,
  )
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Close preview',
    '--exact',
  )
  assert.equal(
    evaluate('!!document.querySelector(".console-item pre.console-code")'),
    false,
  )
  console.log(
    `Text preview escaped source, authentication, and close passed (${slug}).`,
  )
} finally {
  close()
}
