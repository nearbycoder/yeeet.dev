import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, close } = localBrowser('budgets')
try {
  login()
  open('/dashboard')
  const site = evaluate(
    'Array.from(document.querySelectorAll("a")).find(a=>/^\\/dashboard\\/sites\\/[^/]+$/.test(new URL(a.href).pathname))?.href',
  )
  assert.ok(site)
  open(`${site}/inspect`)
  evaluate(
    'Array.from(document.querySelectorAll("details")).find(e=>e.querySelector("summary")?.textContent==="Asset budget review").open=true',
  )
  browser('fill', '[name=asset-file-budget]', '256')
  browser('fill', '[name=asset-total-budget]', '8')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Save site budgets',
    '--exact',
  )
  browser('wait', '--text', 'Budgets saved for this site.')
  assert.equal(
    evaluate(
      'Object.entries(localStorage).filter(([key])=>key.startsWith("yeeet:asset-budget:")).some(([,value])=>value.includes("256")&&value.includes("8"))',
    ),
    true,
  )
  open(`${site}/inspect`)
  browser(
    'wait',
    '--fn',
    'Array.from(document.querySelectorAll("input[type=number]")).map(e=>e.value).join(",")==="256,8"',
  )
  assert.equal(
    evaluate(
      'Array.from(document.querySelectorAll("input[type=number]")).map(e=>e.value).join(",")',
    ),
    '256,8',
  )
  evaluate(
    'Array.from(document.querySelectorAll("details")).find(e=>e.querySelector("summary")?.textContent==="Asset budget review").open=true',
  )
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Reset budgets',
    '--exact',
  )
  browser('wait', '--text', 'Saved budgets cleared. Defaults restored.')
  open(`${site}/inspect`)
  assert.equal(
    evaluate(
      'Array.from(document.querySelectorAll("input[type=number]")).map(e=>e.value).join(",")',
    ),
    '512,10',
  )
  console.log(
    'Site budgets persist across reloads and reset removes saved values.',
  )
} finally {
  close()
}
