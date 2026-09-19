import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, open, login, drop, close } = localBrowser('unsaved')
try {
  login()
  open('/dashboard')
  drop()
  browser('find', 'role', 'link', 'click', '--name', 'Workspaces', '--exact')
  browser('wait', '[role=alertdialog]')
  assert.equal(evaluate('location.pathname'), '/dashboard')
  browser('find', 'role', 'button', 'click', '--name', 'Keep working')
  assert.equal(
    evaluate('!!document.querySelector("[role=alertdialog]")'),
    false,
  )
  assert.equal(
    evaluate(
      'document.querySelector(".dropzone").textContent.includes("1 file cleared")',
    ),
    true,
  )
  browser('find', 'role', 'link', 'click', '--name', 'Workspaces', '--exact')
  browser('find', 'role', 'button', 'click', '--name', 'Leave page')
  browser('wait', '--fn', 'location.pathname.endsWith("/workspaces")')
  open('/dashboard')
  const site = evaluate(
    'Array.from(document.querySelectorAll("a")).find(a=>/^\\/dashboard\\/sites\\/[^/]+$/.test(new URL(a.href).pathname))?.href',
  )
  assert.ok(site, 'Requires a disposable site fixture')
  open(site)
  browser('fill', 'textarea', 'Unsaved-work browser fixture')
  browser('find', 'role', 'link', 'click', '--name', 'Versions', '--exact')
  browser('wait', '[role=alertdialog]')
  browser('find', 'role', 'button', 'click', '--name', 'Keep working')
  browser('find', 'role', 'button', 'click', '--name', 'Save site notes')
  browser(
    'wait',
    '--fn',
    'document.body.textContent.includes("Site notes saved.")',
  )
  browser('find', 'role', 'link', 'click', '--name', 'Versions', '--exact')
  browser('wait', '--fn', 'location.pathname.endsWith("/versions")')
  assert.equal(
    evaluate('!!document.querySelector("[role=alertdialog]")'),
    false,
  )
  console.log(
    'Unsaved work passed: upload navigation cancel/leave and note save/removal of guard.',
  )
} finally {
  close()
}
