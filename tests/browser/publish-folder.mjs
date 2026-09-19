import assert from 'node:assert/strict'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } = localBrowser('folder')
try {
  login()
  open('/dashboard')
  drop([
    ['README.md', 'outside'],
    ['dist/index.html', '<html>build</html>'],
    ['dist/app.js', 'app'],
    ['other/index.html', 'other'],
  ])
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  browser('select', '[name="publish-folder"]', 'dist')
  assert.equal(
    evaluate(
      'document.querySelector(".dropzone").textContent.includes("2 files cleared")',
    ),
    true,
  )
  evaluate('document.querySelector(".console-item:has(.file-paths)").open=true')
  assert.deepEqual(
    evaluate(
      'Array.from(document.querySelectorAll(".file-paths label")).map(e=>e.textContent.trim().split(" ·")[0])',
    ),
    ['index.html', 'app.js'],
  )
  browser('select', '[name="publish-folder"]', '')
  assert.equal(
    evaluate(
      'document.querySelector(".dropzone").textContent.includes("4 files cleared")',
    ),
    true,
  )
  console.log('Publish-folder selection and restoration passed.')
} finally {
  close()
}
