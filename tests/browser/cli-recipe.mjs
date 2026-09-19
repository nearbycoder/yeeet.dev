import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, close } = localBrowser('recipe')
try {
  login()
  open('/dashboard')
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  browser('fill', '[name="site-slug"]', 'recipe-demo')
  browser('check', '[name="private-deploy"]')
  browser('fill', '[name="deployment-password"]', 'browser-secret-never-copy')
  evaluate(
    'Array.from(document.querySelectorAll("details")).find(e=>e.querySelector("summary")?.textContent.includes("Use these settings in the CLI")).open=true; navigator.clipboard.writeText=async(value)=>{window.recipeCopied=value}',
  )
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Copy CLI preview command',
    '--exact',
  )
  const copied = evaluate('window.recipeCopied')
  assert.ok(copied.includes("--name 'recipe-demo'"))
  assert.ok(copied.includes('--dry-run'))
  assert.ok(copied.includes('YEEET_DEPLOY_PASSWORD'))
  assert.ok(!copied.includes('browser-secret-never-copy'))
  console.log('CLI preview copy matches settings without exposing passwords.')
} finally {
  close()
}
