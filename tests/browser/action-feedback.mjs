import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

// Optional browser regression checks. Start the app locally and install
// agent-browser before running `npm run test:browser -- http://localhost:3000`.
const origin = new URL(process.argv[2] || 'http://localhost:3000')
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname),
  'Use an isolated local app for browser tests.',
)
const session = `yeeet-feedback-${process.pid}`
function browser(...args) {
  const output = execFileSync(
    'agent-browser',
    ['--session', session, '--json', ...args],
    {
      encoding: 'utf8',
      timeout: 40_000,
    },
  )
  const response = JSON.parse(output)
  assert.equal(response.success, true, response.error)
  return response.data
}
function evaluate(script) {
  return browser('eval', script).result
}
function open(path) {
  browser('open', new URL(path, origin).href)
  browser('wait', '--load', 'networkidle')
}
function click(name) {
  browser('find', 'role', 'button', 'click', '--name', name)
}

try {
  // No authentication request in this suite is allowed to reach the server.
  browser('open', origin.href)
  browser('network', 'route', '**/api/auth/**', '--abort')
  browser('wait', '--load', 'networkidle')
  assert.match(evaluate('document.title'), /^Yeeet/)
  evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new DOMException('Denied', 'NotAllowedError') }
  } })`)
  click('Copy command')
  browser(
    'wait',
    '--fn',
    'document.querySelector(".copy-command").textContent.includes("Copy failed")',
  )
  assert.equal(
    evaluate('document.querySelector(".copy-command").disabled'),
    false,
  )
  evaluate(
    'navigator.clipboard.writeText = async (text) => { window.copiedCommand = text }',
  )
  click('Copy command')
  browser(
    'wait',
    '--fn',
    'document.querySelector(".copy-command").textContent.includes("Copied!")',
  )
  assert.equal(
    evaluate('window.copiedCommand'),
    'yeeet deploy ./dist --name comet',
  )

  open('/login')
  browser('find', 'label', 'Email', 'fill', 'browser-test@example.com')
  browser('find', 'label', 'Password', 'fill', 'Local-test-only-2026')
  click('Enter launchpad →')
  browser('wait', '.form-error')
  assert.match(
    evaluate('document.querySelector("[role=alert]").textContent'),
    /Check your connection/,
  )
  assert.equal(
    evaluate('document.querySelector(".auth-submit").disabled'),
    false,
  )

  click('Create an account')
  browser('find', 'label', 'Invitation code', 'fill', 'test-invitation')
  browser('find', 'label', 'Name', 'fill', 'Browser Test')
  click('Create account →')
  browser('wait', '.form-error')
  assert.match(
    evaluate('document.querySelector("[role=alert]").textContent'),
    /Check your connection/,
  )
  assert.equal(
    evaluate('document.querySelector(".auth-submit").disabled'),
    false,
  )
  console.log(
    'Browser feedback checks passed: clipboard failure/retry and sign-in/signup network recovery.',
  )
} finally {
  browser('close')
}
