import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
export function localBrowser(label) {
  const origin = new URL(process.argv[2] || 'http://localhost:3000')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  assert.ok(process.env.YEEET_TEST_EMAIL && process.env.YEEET_TEST_PASSWORD)
  const session = `yeeet-${label}-${process.pid}`
  function browser(...args) {
    const result = JSON.parse(
      execFileSync('agent-browser', ['--session', session, '--json', ...args], {
        encoding: 'utf8',
        timeout: 40000,
      }),
    )
    assert.equal(result.success, true, result.error)
    return result.data
  }
  const evaluate = (script) => browser('eval', script).result
  function open(path) {
    browser('open', new URL(path, origin).href)
    browser('wait', '800')
  }
  function login() {
    browser('set', 'media', 'light', 'reduced-motion')
    open('/')
    assert.equal(
      evaluate(
        `(async()=>{const r=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({ email: process.env.YEEET_TEST_EMAIL, password: process.env.YEEET_TEST_PASSWORD })})});return r.ok})()`,
      ),
      true,
    )
  }
  function drop(
    files = [['index.html', '<html>Local browser fixture</html>']],
  ) {
    evaluate(
      `(()=>{const data=new DataTransfer();for(const [path,text] of ${JSON.stringify(files)}) data.items.add(new File([text],path,{type:'text/html'}));document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}))})()`,
    )
    browser(
      'wait',
      '--fn',
      'document.querySelector(".dropzone").textContent.includes("cleared for takeoff")',
    )
  }
  return {
    browser,
    evaluate,
    open,
    login,
    drop,
    origin,
    close: () => browser('close'),
  }
}
