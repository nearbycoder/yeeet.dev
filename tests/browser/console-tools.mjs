import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Optional regression: use an isolated app/database with 28 ready
// releases and a readable config/build.json fixture. Never use a hosted account.
const origin = new URL(process.argv[2] || 'http://127.0.0.1:3000')
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname),
  'Use an isolated local app.',
)
const email = process.env.YEEET_TEST_EMAIL
const password = process.env.YEEET_TEST_PASSWORD
assert.ok(email && password, 'Set the isolated test account credentials.')
const slug = process.env.YEEET_TEST_SITE || 'console-review'
const session = `yeeet-console-tools-${process.pid}`
const temporary = mkdtempSync(join(tmpdir(), 'yeeet-console-tools-'))
function browser(...args) {
  const output = execFileSync(
    'agent-browser',
    ['--session', session, '--json', ...args],
    { encoding: 'utf8', timeout: 40_000 },
  )
  const response = JSON.parse(output)
  assert.equal(response.success, true, response.error)
  return response.data
}
const evaluate = (script) =>
  browser(
    'eval',
    script.startsWith('await ') ? `(async()=>{return ${script}})()` : script,
  ).result
const wait = (script) => browser('wait', '--fn', script)
function open(path, text) {
  browser('open', new URL(path, origin).href)
  browser('wait', '--load', 'networkidle')
  if (text) browser('wait', '--text', text)
  browser('snapshot', '-i')
}
function button(name) {
  browser('snapshot', '-i')
  browser('find', 'role', 'button', 'click', '--name', name, '--exact')
}
function select(name, value) {
  const { refs } = browser('snapshot', '-i')
  const entry = Object.entries(refs).find(
    ([, item]) => item.role === 'combobox' && item.name === name,
  )
  assert.ok(entry, `Missing select: ${name}`)
  browser('select', `@${entry[0]}`, value)
}
function captureDownloads() {
  evaluate(`window.downloadBlobs=[];
    const create=URL.createObjectURL;
    URL.createObjectURL=blob=>{window.downloadBlobs.push(blob);return create(blob)};
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this)};`)
}
function assertNoOverflow() {
  assert.equal(
    evaluate('document.documentElement.scrollWidth > innerWidth'),
    false,
  )
}

try {
  browser('set', 'media', 'light', 'reduced-motion')
  open('/login', 'Welcome back.')
  browser('fill', 'input[name=email]', email)
  browser('fill', 'input[name=password]', password)
  button('Enter launchpad →')
  browser('wait', '--url', '**/dashboard')
  browser('wait', '--load', 'networkidle')
  browser('wait', '--text', 'Live sites')
  browser('snapshot', '-i')
  assertNoOverflow()

  browser('press', 'Control+k')
  browser('wait', 'dialog[open]')
  browser('snapshot', '-i')
  browser('press', 'ArrowDown')
  assert.match(evaluate('document.activeElement.textContent'), /Dashboard/)
  browser('press', 'Escape')
  assert.equal(
    evaluate('Boolean(document.querySelector("dialog[open]"))'),
    false,
  )
  assert.match(evaluate('document.activeElement.textContent'), /Switch site/)

  captureDownloads()
  button('Export fleet page CSV')
  const fleetCsv = evaluate('await window.downloadBlobs[0].text()')
  assert.ok(fleetCsv.includes(slug))
  assert.ok(!fleetCsv.includes('passwordHash'))

  open(`/dashboard/sites/${slug}/inspect`, 'Deployment inspector')
  select('Folder', 'assets/')
  browser('find', 'label', 'Minimum size (KiB)', 'fill', '0.05')
  wait(
    'document.querySelector(".file-explorer .console-table tbody").children.length === 2',
  )
  button('Select all matches')
  wait(
    'document.querySelector(".selection-toolbar").textContent.includes("2 selected")',
  )
  captureDownloads()
  button('Export selected CSV')
  assert.equal(
    evaluate('await window.downloadBlobs[0].text()')
      .split('\r\n')
      .filter(Boolean).length,
    3,
  )
  select('Folder', '')
  browser('find', 'label', 'Minimum size (KiB)', 'fill', '')
  browser('find', 'label', 'Find a file', 'fill', 'config/build.json')
  wait(
    'document.querySelector(".file-explorer .console-table tbody").children.length === 1',
  )
  assert.match(
    evaluate('document.querySelector(".selection-toolbar").textContent'),
    /2 selected/,
  )
  browser('click', 'summary[aria-label="Actions for config/build.json"]')
  browser('snapshot', '-i')
  button('Preview config/build.json')
  browser('wait', '--text', 'UTF-8 source shown as plain text.')
  browser('snapshot', '-i')
  button('Format JSON')
  browser('find', 'label', 'Find in source', 'fill', 'review')
  wait(
    'document.querySelector(".source-reader mark")?.textContent === "review"',
  )
  assert.match(
    evaluate('document.querySelector(".source-toolbar").textContent'),
    /line 2/,
  )
  browser('find', 'label', 'Wrap long lines', 'check')
  assert.equal(
    evaluate('Boolean(document.querySelector(".source-line-numbers"))'),
    false,
  )
  const unauthorized = evaluate(
    `await fetch(document.querySelector('.file-actions-menu a[download]').href,{credentials:'omit'}).then(r=>r.status)`,
  )
  assert.equal(unauthorized, 401)
  evaluate(
    `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}})`,
  )
  button('Copy displayed source')
  browser('wait', '--text', 'Copy failed. Retry')
  evaluate(
    'navigator.clipboard.writeText=async text=>{window.copiedSource=text}',
  )
  button('Copy displayed source')
  wait('Boolean(window.copiedSource)')
  assert.equal(JSON.parse(evaluate('window.copiedSource')).name, 'review')
  browser('focus', 'section[aria-label^="Text preview:"] > button')
  browser('press', 'Enter')
  wait('!document.querySelector(".source-reader")')

  open(`/dashboard/sites/${slug}/versions`, 'Showing 25 versions')
  browser(
    'check',
    '.site-version-card:first-child .site-version-actions input[type=checkbox]',
  )
  const baseline = evaluate(
    'new URL(document.querySelector(".site-version-actions a").href).searchParams.get("version")',
  )
  browser('find', 'text', 'Older versions', 'click', '--exact')
  browser('wait', '--text', 'Showing 3 versions')
  browser('snapshot', '-i')
  browser(
    'check',
    '.site-version-card:first-child .site-version-actions input[type=checkbox]',
  )
  const comparison = evaluate(
    'document.querySelector(".comparison-tray a").href',
  )
  assert.equal(new URL(comparison).searchParams.get('base'), baseline)
  assert.notEqual(new URL(comparison).searchParams.get('version'), baseline)
  button('Swap baseline and target')
  assert.equal(
    new URL(
      evaluate('document.querySelector(".comparison-tray a").href'),
    ).searchParams.get('version'),
    baseline,
  )
  browser('click', '.comparison-tray a')
  browser('wait', '--text', 'Changes from the comparison version')

  open(`/dashboard/sites/${slug}/analytics?days=7`, 'Previous 7 days')
  button('Weekly')
  const weeklyRows = evaluate(
    'document.querySelectorAll(".site-analytics-day").length',
  )
  assert.ok(weeklyRows >= 1 && weeklyRows <= 2)
  captureDownloads()
  button('Export analytics JSON')
  const analytics = JSON.parse(evaluate('await window.downloadBlobs[0].text()'))
  assert.equal(analytics.period.days, 7)
  assert.equal(analytics.comparison.period.days, 7)
  assert.equal(
    analytics.daily.reduce((sum, day) => sum + day.views, 0),
    analytics.totalViews,
  )
  button('90 days')
  browser('wait', '--text', 'Previous 90 days')
  assert.ok(browser('get', 'url').url.includes('days=90'))

  browser('set', 'viewport', '390', '844')
  assertNoOverflow()
  open(`/dashboard/sites/${slug}/inspect`, 'Deployment inspector')
  assertNoOverflow()
  assert.ok(
    evaluate(
      'document.querySelector(".file-explorer .console-table-scroll").scrollWidth > document.querySelector(".file-explorer .console-table-scroll").clientWidth',
    ),
  )
  button('Toggle color theme')
  wait('document.documentElement.dataset.theme === "dark"')
  assertNoOverflow()
  button('Toggle color theme')
  wait('document.documentElement.dataset.theme === "light"')
  open('/dashboard', 'Live sites')
  assertNoOverflow()
  const sources = [
    ['index.html', '<h1>Test</h1>'],
    ['app.js', 'console.log(1)'],
    ['app.js.map', '{}'],
    ['.env.local', 'EXAMPLE=true'],
  ]
  const paths = sources.map(([name, text]) => {
    const path = join(temporary, name)
    writeFileSync(path, text)
    return path
  })
  browser(
    'upload',
    '.dropzone input[type=file]:not([webkitdirectory])',
    ...paths,
  )
  browser('wait', '--text', '4 files cleared for takeoff')
  browser('focus', '.deploy-advanced > summary')
  browser('press', 'Enter')
  wait('document.querySelector(".deploy-advanced").open')
  browser('snapshot', '-i')
  browser('focus', 'details:has(> .upload-rule-editor) > summary')
  browser('press', 'Enter')
  wait('document.querySelector(".upload-rule-editor").parentElement.open')
  browser('focus', '.upload-rule-editor > summary')
  browser('press', 'Enter')
  wait('document.querySelector(".upload-rule-editor").open')
  browser('snapshot', '-i')
  browser('fill', '.upload-rule-editor textarea', '**/*.map\n.env*')
  browser('wait', '--text', 'Will exclude 2 included files')
  button('Apply exclusion patterns')
  browser('wait', '--text', '2 included · 2 excluded')
  button('Review changes')
  browser('wait', '--text', 'Review your deployment')
  button('Undo selection change')
  browser('wait', '--text', '4 included · 0 excluded')
  assert.equal(
    evaluate('Boolean(document.querySelector(".deployment-review"))'),
    false,
  )
  button('Redo selection change')
  browser('wait', '--text', '2 included · 2 excluded')
  button('Restore all files')
  browser('wait', '--text', '4 included · 0 excluded')
  assertNoOverflow()
  assert.equal(
    evaluate('Boolean(document.querySelector(".deploy-success"))'),
    false,
  )
  console.log(
    'Console regression passed: navigation, exports, file selection/source authorization, comparison paging, analytics, mobile/themes, exclusion undo/redo. No deployment was created.',
  )
} catch (failure) {
  console.error(
    'Last page:',
    new URL(browser('get', 'url').url).pathname,
    evaluate('document.body.innerText.slice(0,1500)'),
  )
  throw failure
} finally {
  browser('close')
  rmSync(temporary, { recursive: true, force: true })
}
