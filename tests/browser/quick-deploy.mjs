import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { get } from 'node:http'

// Uses a disposable local app, an existing test account, and local object storage.
// YEEET_TEST_EMAIL / YEEET_TEST_PASSWORD must identify that local account.
const origin = new URL(process.argv[2] || 'http://localhost:3000')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
assert.ok(process.env.YEEET_TEST_EMAIL && process.env.YEEET_TEST_PASSWORD)
const session = `yeeet-quick-${process.pid}`
function browser(...args) {
  const response = JSON.parse(
    execFileSync('agent-browser', ['--session', session, '--json', ...args], {
      encoding: 'utf8',
      timeout: 40000,
    }),
  )
  assert.equal(response.success, true, response.error)
  return response.data
}
const evaluate = (script) => browser('eval', script).result
function open(path) {
  browser('open', new URL(path, origin).href)
  browser('wait', '--fn', '!!document.querySelector(".quick-deploy-controls")')
  browser('wait', '800')
}
function drop(text = 'Quick deploy browser regression') {
  evaluate(
    `(() => {const transfer = new DataTransfer();transfer.items.add(new File([${JSON.stringify(`<html><body>${text}</body></html>`)}], 'index.html', {type:'text/html'}));document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}))})()`,
  )
  browser(
    'wait',
    '--fn',
    'document.querySelector(".dropzone").textContent.includes("1 file cleared") && !document.querySelector(".quick-deploy-controls .deploy-button").textContent.includes("Preparing")',
  )
}
function captureRequests() {
  evaluate(
    `window.deployRequests=[];window.quickFetch=window.fetch;window.fetch=async (...args)=>{if(args[0]==='/api/v1/deployments'&&args[1]?.body){const body=JSON.parse(args[1].body);window.deployRequests.push({slug:body.slug,channel:body.channel,spa:body.spaFallback,private:Boolean(body.password),dryRun:Boolean(body.dryRun)})}return window.quickFetch(...args)}`,
  )
}
function publish() {
  browser('click', '.quick-deploy-controls .deploy-button')
  browser(
    'wait',
    '--fn',
    '!!document.querySelector(".deploy-success a") && document.querySelector(".quick-deploy-controls .deploy-button").textContent.includes("Deployed")',
  )
  return evaluate('document.querySelector(".deploy-success a").href')
}
function advanced() {
  const wasOpen = evaluate('document.querySelector(".deploy-advanced").open')
  browser('click', '.deploy-advanced > summary')
  browser(
    'wait',
    '--fn',
    `document.querySelector(".deploy-advanced").open === ${!wasOpen}`,
  )
}
try {
  browser('set', 'media', 'reduced-motion')
  browser('open', origin.href)
  assert.equal(
    evaluate(
      `(async()=>{const result=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({ email: process.env.YEEET_TEST_EMAIL, password: process.env.YEEET_TEST_PASSWORD })})});return result.ok})()`,
    ),
    true,
  )
  open('/dashboard')
  assert.equal(
    evaluate('document.querySelector(".deploy-advanced").open'),
    false,
  )
  assert.equal(
    evaluate(
      'document.querySelector("input[name=site-slug]").checkVisibility()',
    ),
    false,
  )
  captureRequests()
  drop()
  const url = await publish()
  assert.deepEqual(evaluate('window.deployRequests'), [
    { slug: '', spa: true, private: false, dryRun: false },
  ])
  const live = await new Promise((resolve, reject) => {
    get(
      new URL('/', origin),
      {
        headers: { host: new URL(url).hostname, accept: 'text/html' },
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode, body }))
        response.on('error', reject)
      },
    ).on('error', reject)
  })
  assert.equal(live.status, 200)
  assert.ok(live.body.includes('Quick deploy browser regression'))
  drop('Second drag after success')
  await publish()
  assert.equal(evaluate('window.deployRequests.length'), 2)

  drop('Recover interrupted deployment')
  evaluate(
    `window.resumeFetch=window.fetch;window.resumeKeys=[];window.interruptNext=true;window.fetch=async(...args)=>{if(args[0]==='/api/v1/deployments'&&args[1]?.method==='POST'){window.resumeKeys.push(args[1].headers['idempotency-key']);if(window.interruptNext){window.interruptNext=false;throw new Error('Simulated connection interruption')}}return window.resumeFetch(...args)}`,
  )
  browser('click', '.quick-deploy-controls .deploy-button')
  browser(
    'wait',
    '--fn',
    'document.querySelector(".deploy-error")?.textContent.includes("Simulated connection interruption") && !document.querySelector(".quick-deploy-controls .deploy-button").disabled',
  )
  assert.ok(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").textContent.includes("Resume upload")',
    ),
  )
  await publish()
  const resumeKeys = evaluate('window.resumeKeys')
  assert.equal(resumeKeys.length, 2)
  assert.ok(resumeKeys[0])
  assert.equal(resumeKeys[0], resumeKeys[1])
  evaluate('window.fetch=window.resumeFetch')

  drop('Private static deployment')
  advanced()
  const slug = `quick-private-${Date.now()}`
  browser('fill', 'input[name=site-slug]', slug)
  browser('uncheck', 'input[name=spa-fallback]')
  browser('check', 'input[name=private-deploy]')
  // Review remains optional and works even before a required password is entered.
  browser('find', 'role', 'button', 'click', '--name', 'Review changes')
  browser('wait', '--fn', '!!document.querySelector(".deployment-review")')
  browser('fill', 'input[name=deployment-channel]', 'staging')
  assert.equal(
    evaluate('!!document.querySelector(".deployment-review")'),
    false,
  )
  browser('click', 'input[name=deployment-channel]')
  browser('press', 'Control+a')
  browser('press', 'Backspace')
  assert.equal(
    evaluate('document.querySelector("input[name=deployment-channel]").value'),
    '',
  )
  assert.ok(
    evaluate(
      'document.querySelector(".deploy-destination").textContent.includes("production")',
    ),
  )
  advanced()
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    true,
  )
  assert.equal(
    evaluate(
      'document.querySelector("input[name=deployment-password]").checkVisibility()',
    ),
    true,
  )
  browser(
    'fill',
    'input[name=deployment-password]',
    'Private-fixture-only-2026',
  )
  await publish()
  assert.deepEqual(evaluate('window.deployRequests.at(-1)'), {
    slug,
    spa: false,
    private: true,
    dryRun: false,
  })
  assert.equal(
    evaluate('document.querySelector("input[name=private-deploy]").checked'),
    true,
  )
  open(`/dashboard?site=${slug}`)
  assert.equal(
    evaluate('document.querySelector(".deploy-advanced").open'),
    false,
  )
  assert.equal(
    evaluate('document.querySelector("input[name=private-deploy]").checked'),
    true,
  )
  assert.equal(
    evaluate('document.querySelector("input[name=spa-fallback]").checked'),
    false,
  )
  drop('Private update')
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    true,
  )
  browser(
    'fill',
    'input[name=deployment-password]',
    'Private-fixture-only-2026',
  )
  captureRequests()
  await publish()
  assert.equal(evaluate('window.deployRequests[0].private'), true)

  open('/dashboard')
  evaluate(
    `(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['placeholder'],'.env',{type:'text/plain'}));document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}))})()`,
  )
  browser('wait', '.quick-deploy-warning')
  assert.equal(
    evaluate('document.querySelector(".deploy-advanced").open'),
    false,
  )
  browser('find', 'role', 'button', 'click', '--name', 'Review files')
  browser('wait', '--fn', 'document.querySelector(".deploy-advanced").open')
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Exclude likely private files',
  )
  assert.equal(
    evaluate(
      'document.querySelector(".quick-deploy-controls .deploy-button").disabled',
    ),
    true,
  )
  console.log(
    'Quick deploy passed: one-click publishing, real served content, repeat drag, interrupted upload recovery, optional review invalidation, preserved advanced settings, private update protection, and visible sensitive-file warning.',
  )
} finally {
  browser('close')
}
