import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localBrowser } from './helpers.mjs'
const { browser, evaluate, login, open, drop, close } =
  localBrowser('add-files')
const directory = mkdtempSync(join(tmpdir(), 'yeeet-add-'))
try {
  login()
  open('/dashboard')
  drop([
    ['index.html', 'original'],
    ['keep.txt', 'keep'],
  ])
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  writeFileSync(join(directory, 'extra.txt'), 'extra')
  browser('upload', '[name="additional-files"]', join(directory, 'extra.txt'))
  browser(
    'wait',
    '--fn',
    'document.querySelector(".dropzone").textContent.includes("3 files cleared")',
  )
  writeFileSync(join(directory, 'index.html'), 'replacement with more bytes')
  browser('upload', '[name="additional-files"]', join(directory, 'index.html'))
  assert.equal(
    evaluate(
      'document.querySelector(".dropzone").textContent.includes("3 files cleared")',
    ),
    true,
  )
  evaluate('document.querySelector(".console-item:has(.file-paths)").open=true')
  assert.equal(
    evaluate(
      'document.querySelector(".file-paths").textContent.includes("index.html · 27 B")',
    ),
    true,
  )
  console.log('Adding and replacing files retains the rest of the build.')
} finally {
  close()
  rmSync(directory, { recursive: true, force: true })
}
