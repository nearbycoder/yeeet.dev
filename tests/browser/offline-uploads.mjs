import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, open, login, drop, close } = localBrowser('offline')
try {
  login()
  open('/dashboard')
  drop()
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    false,
  )
  browser('set', 'offline', 'on')
  browser(
    'wait',
    '--fn',
    'document.body.textContent.includes("You’re offline")',
  )
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    true,
  )
  browser('set', 'offline', 'off')
  browser(
    'wait',
    '--fn',
    '!document.querySelector(".quick-deploy-controls .deploy-button").disabled',
  )
  assert.equal(
    evaluate(
      'document.querySelector(".dropzone").textContent.includes("1 file cleared")',
    ),
    true,
  )
  assert.equal(evaluate('!!document.querySelector(".deploy-success")'), false)
  console.log(
    'Offline upload checks passed: disabled publishing, retained files, and manual reconnect.',
  )
} finally {
  browser('set', 'offline', 'off')
  close()
}
