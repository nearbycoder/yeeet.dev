import { spawn } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function input(name) {
  return process.env[`INPUT_${name.replaceAll('-', '_').toUpperCase()}`]?.trim()
}

function safeSitePart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function previewSiteName(value, pullRequest) {
  const suffix = `-pr-${pullRequest}`
  const base = safeSitePart(value)
    .slice(0, 63 - suffix.length)
    .replace(/-+$/g, '')
  if (!base)
    throw new Error(
      'The preview site name does not contain any letters or numbers.',
    )
  return `${base}${suffix}`
}

export function previewComment({ mode, site, url, versionUrl }) {
  const marker = `<!-- yeeet-preview:${site} -->`
  if (mode === 'cleanup') {
    return `${marker}\n## Preview returned to orbit\n\nYeeet removed the temporary \`${site}\` site for this pull request.`
  }
  return `${marker}\n## 🚀 Yeeet preview is live\n\n| | URL |\n| --- | --- |\n| Preview | ${url} |\n| Immutable version | ${versionUrl} |\n\nEvery update to this pull request replaces the preview atomically.`
}

function eventRepository(payload) {
  return process.env.GITHUB_REPOSITORY || payload.repository?.full_name || ''
}

function pullRequestNumber(payload) {
  const explicit = input('pr-number')
  const value =
    explicit || payload.pull_request?.number || payload.issue?.number
  if (value == null || !/^\d+$/.test(String(value))) return null
  return String(value)
}

async function eventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) return {}
  try {
    return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function commandError(message) {
  process.stderr.write(`::error::${String(message).replace(/[\r\n]+/g, ' ')}\n`)
  process.exitCode = 1
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT || value == null) return
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`)
}

async function addSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
}

function runCli(argumentsList, environment) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, argumentsList, {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (stderr.trim()) process.stderr.write(stderr)
      if (code === 0) return resolvePromise(stdout.trim())
      const error = new Error(`Yeeet CLI exited with status ${code}.`)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
  })
}

function parseCliJson(value) {
  const line = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1)
  if (!line) return {}
  return JSON.parse(line)
}

async function upsertPullRequestComment({ body, payload, pullRequest, token }) {
  const repository = eventRepository(payload)
  if (!repository || !pullRequest || !token) return
  const api = process.env.GITHUB_API_URL || 'https://api.github.com'
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'yeeet-preview-action',
    'x-github-api-version': '2022-11-28',
  }
  const commentsUrl = `${api}/repos/${repository}/issues/${pullRequest}/comments`
  const commentsResponse = await fetch(`${commentsUrl}?per_page=100`, {
    headers,
  })
  if (!commentsResponse.ok) {
    throw new Error(
      `GitHub comment lookup failed (${commentsResponse.status}).`,
    )
  }
  const marker = body.split('\n', 1)[0]
  const comments = await commentsResponse.json()
  const existing = comments.find(
    (comment) => comment.user?.type === 'Bot' && comment.body?.includes(marker),
  )
  const response = await fetch(
    existing
      ? `${api}/repos/${repository}/issues/comments/${existing.id}`
      : commentsUrl,
    {
      method: existing ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify({ body }),
    },
  )
  if (!response.ok) {
    throw new Error(`GitHub comment update failed (${response.status}).`)
  }
}

export async function run() {
  const token = input('token')
  if (!token) throw new Error('The token input is required.')
  process.stdout.write(`::add-mask::${token}\n`)

  const mode = input('mode') || 'deploy'
  if (!['deploy', 'cleanup'].includes(mode)) {
    throw new Error('mode must be either deploy or cleanup.')
  }
  const cliVersion = input('cli-version') || 'latest'
  if (!/^(?:latest|next|v?\d[0-9A-Za-z.+-]*)$/.test(cliVersion)) {
    throw new Error('cli-version must be a release tag or exact version.')
  }

  const payload = await eventPayload()
  const pullRequest = pullRequestNumber(payload)
  const repositoryName = eventRepository(payload).split('/').at(-1) || ''
  const configuredSite = input('site') || repositoryName
  const site = pullRequest
    ? previewSiteName(configuredSite, pullRequest)
    : safeSitePart(configuredSite)
  if (mode === 'cleanup' && !pullRequest) {
    throw new Error('cleanup mode requires a pull request number.')
  }

  const common = [
    '--yes',
    `@yeeet.dev/cli@${cliVersion}`,
    '--api',
    input('api') || 'https://yeeet.dev',
    '--json',
  ]
  const environment = {
    ...process.env,
    YEEET_TOKEN: token,
    ...(input('password') ? { YEEET_DEPLOY_PASSWORD: input('password') } : {}),
  }

  let result
  if (mode === 'cleanup') {
    try {
      result = parseCliJson(
        await runCli([...common, 'remove', site, '--yes'], environment),
      )
    } catch (error) {
      if (!String(error.stderr).includes('"code":"not_found"')) throw error
      result = { site, status: 'already_removed' }
    }
  } else {
    const deployArguments = [
      ...common,
      'deploy',
      input('directory') || '.',
      ...(site ? ['--name', site] : []),
      ...(input('channel') ? ['--channel', input('channel')] : []),
      input('spa') === 'false' ? '--static' : '--spa',
    ]
    result = parseCliJson(await runCli(deployArguments, environment))
  }

  await Promise.all([
    setOutput('site', result.site || site),
    setOutput('url', result.url),
    setOutput('version-url', result.versionUrl),
    setOutput('deployment', result.deployment),
  ])

  const comment = previewComment({
    mode,
    site: result.site || site,
    url: result.url,
    versionUrl: result.versionUrl,
  })
  if (input('comment') !== 'false') {
    await upsertPullRequestComment({
      body: comment,
      payload,
      pullRequest,
      token: input('github-token'),
    })
  }
  await addSummary(comment.replace(/^<!--.*-->\n/, ''))
  process.stdout.write(
    mode === 'cleanup'
      ? `Removed Yeeet preview ${site}.\n`
      : `Deployed Yeeet preview to ${result.url}.\n`,
  )
}

const invokedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false
if (invokedPath) run().catch((error) => commandError(error.message))
