import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('limits')
try {
  login()
  open('/dashboard')
  evaluate(
    'window.hashWorkers=0;const RealWorker=window.Worker;window.Worker=class extends RealWorker{constructor(...args){super(...args);window.hashWorkers++}}',
  )
  drop(Array.from({ length: 5001 }, (_, i) => [`asset-${i}.txt`, 'x']))
  browser('wait', '--text', '5,001 files selected; the limit is 5,000.')
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    true,
  )
  assert.equal(evaluate('window.hashWorkers'), 0)
  drop()
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    false,
  )
  console.log(
    'Oversized selection blocked before hashing; smaller replacement accepted.',
  )
} finally {
  close()
}
