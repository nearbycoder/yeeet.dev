import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, close } = localBrowser('presets')
try {
  login()
  open('/dashboard')
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  browser('fill', '[name="site-slug"]', 'preset-fixture')
  browser('fill', '[name="deployment-channel"]', 'staging')
  browser('check', '[name="private-deploy"]')
  browser('fill', '[name="deployment-password"]', 'not-saved-2026')
  evaluate(
    'Array.from(document.querySelectorAll("details")).find(e=>e.querySelector("summary")?.textContent.includes("Deployment presets")).open=true',
  )
  browser('fill', '[name="preset-name"]', 'Browser fixture')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Save deployment preset',
    '--exact',
  )
  browser('wait', '--text', 'Preset saved.')
  assert.equal(
    evaluate(
      'Object.entries(localStorage).filter(([k])=>k.startsWith("yeeet:deployment-presets:")).some(([,v])=>v.includes("not-saved-2026"))',
    ),
    false,
  )
  browser('fill', '[name="site-slug"]', 'different')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Apply Browser fixture',
    '--exact',
  )
  assert.equal(
    evaluate('document.querySelector("[name=site-slug]").value'),
    'preset-fixture',
  )
  assert.equal(
    evaluate('document.querySelector("[name=deployment-password]").value'),
    '',
  )
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Delete deployment preset Browser fixture',
    '--exact',
  )
  browser('wait', '--text', 'Preset deleted.')
  console.log('Preset save, apply, secret exclusion, and delete passed.')
} finally {
  close()
}
