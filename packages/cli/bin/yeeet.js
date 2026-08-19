#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { Command } from 'commander'
import fg from 'fast-glob'
import mime from 'mime-types'
import open from 'open'

const VERSION = '0.0.2'
const CLIENT_ID = 'yeeet-cli'
const DEFAULT_API = 'https://yeeet.dev'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

function configPath() {
  const root = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(root, 'yeeet', 'config.json')
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function readConfig() {
  return readJson(configPath())
}

async function writeConfig(value) {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
}

function normalizeApi(value) {
  return value.replace(/\/+$/, '')
}

async function context(options = {}) {
  const saved = await readConfig()
  return {
    api: normalizeApi(
      options.api || process.env.YEEET_API || saved.api || DEFAULT_API,
    ),
    token: process.env.YEEET_TOKEN || saved.token,
    saved,
  }
}

async function responseJson(response) {
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text }
  }
  if (!response.ok) {
    const error = new Error(
      data.error?.message ||
        data.message ||
        data.error_description ||
        `Request failed (${response.status})`,
    )
    error.code = data.error?.code || data.code || data.error || 'request_failed'
    error.status = response.status
    error.details = data.error?.details
    throw error
  }
  return data
}

async function apiRequest(path, options = {}, commandOptions = {}) {
  const ctx = await context(commandOptions)
  if (!ctx.token) {
    const error = new Error(
      'Not logged in. Run `yeeet login` or set YEEET_TOKEN.',
    )
    error.code = 'not_authenticated'
    throw error
  }
  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${ctx.token}`)
  headers.set('user-agent', `yeeet-cli/${VERSION}`)
  headers.set('x-yeeet-client', `cli/${VERSION}`)
  return responseJson(await fetch(`${ctx.api}${path}`, { ...options, headers }))
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function print(value, json) {
  if (json) console.log(JSON.stringify(value))
  else console.log(value)
}

async function login(options) {
  const ctx = await context(options)
  const codes = await responseJson(
    await fetch(`${ctx.api}/api/auth/device/code`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `yeeet-cli/${VERSION}`,
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope: 'openid profile email',
      }),
    }),
  )

  const verificationPath =
    codes.verification_uri_complete ||
    `${codes.verification_uri}?user_code=${encodeURIComponent(codes.user_code)}`
  const verificationUrl = new URL(verificationPath, `${ctx.api}/`).toString()
  if (options.json) {
    print(
      {
        status: 'authorization_pending',
        userCode: codes.user_code,
        verificationUrl,
      },
      true,
    )
  } else {
    console.log('\n  Connect this terminal to Yeeet\n')
    console.log(`  Open: ${verificationUrl}`)
    console.log(`  Code: ${codes.user_code}\n`)
  }
  if (options.open !== false) {
    await open(verificationUrl).catch(() => undefined)
  }

  let interval = Number(codes.interval || 5)
  const expiresAt = Date.now() + Number(codes.expires_in || 15 * 60) * 1000
  while (Date.now() < expiresAt) {
    await sleep(interval * 1000)
    try {
      const token = await responseJson(
        await fetch(`${ctx.api}/api/auth/device/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': `yeeet-cli/${VERSION}`,
          },
          body: JSON.stringify({
            grant_type: GRANT_TYPE,
            device_code: codes.device_code,
            client_id: CLIENT_ID,
          }),
        }),
      )
      if (token.access_token) {
        await writeConfig({
          ...ctx.saved,
          api: ctx.api,
          token: token.access_token,
        })
        const user = await apiRequest('/api/v1/me', {}, { api: ctx.api })
        print(
          options.json
            ? { status: 'authenticated', user: user.user, api: ctx.api }
            : `✓ Logged in${user.user?.email ? ` as ${user.user.email}` : ''}. Ready to yeeet.`,
          options.json,
        )
        return
      }
    } catch (error) {
      if (error.code === 'authorization_pending') continue
      if (error.code === 'slow_down') {
        interval += 5
        continue
      }
      throw error
    }
  }
  throw new Error('The login code expired. Run `yeeet login` again.')
}

async function findFiles(target) {
  const targetPath = resolve(target)
  const targetStat = await stat(targetPath)
  if (targetStat.isFile()) {
    return [
      {
        path: basename(targetPath),
        absolutePath: targetPath,
        size: targetStat.size,
      },
    ]
  }
  if (!targetStat.isDirectory())
    throw new Error(`${target} is not a file or directory.`)

  const ignoreFile = await readFile(
    join(targetPath, '.yeeetignore'),
    'utf8',
  ).catch(() => '')
  const ignore = [
    '.git/**',
    'node_modules/**',
    '.DS_Store',
    '.yeeetignore',
    ...ignoreFile
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  ]
  const matches = await fg('**/*', {
    cwd: targetPath,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
    ignore,
  })
  return Promise.all(
    matches.sort().map(async (path) => {
      const absolutePath = join(targetPath, ...path.split('/'))
      const info = await stat(absolutePath)
      return { path, absolutePath, size: info.size }
    }),
  )
}

async function runConcurrent(values, limit, worker) {
  let cursor = 0
  async function next() {
    while (cursor < values.length) {
      const value = values[cursor++]
      await worker(value)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, next),
  )
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
}

function printDeploymentDiff(plan) {
  console.log(
    `\n  Deployment diff${plan.targetUrl ? ` for ${plan.targetUrl}` : ''}\n`,
  )
  console.log(
    `  + ${plan.summary.added} added  ~ ${plan.summary.changed} changed  - ${plan.summary.removed} removed  = ${plan.summary.unchanged} unchanged`,
  )
  console.log(`  ${formatBytes(plan.summary.uploadBytes)} would upload\n`)
  for (const [marker, key] of [
    ['+', 'added'],
    ['~', 'changed'],
    ['-', 'removed'],
  ]) {
    for (const path of plan[key]) console.log(`  ${marker} ${path}`)
  }
  console.log('')
}

async function deploy(target, options) {
  const targetPath = resolve(target)
  const projectConfig = await readJson(
    join(
      (await stat(targetPath)).isDirectory() ? targetPath : dirname(targetPath),
      '.yeeet.json',
    ),
  )
  const slug = options.name || projectConfig.name || undefined
  const channel = options.channel || projectConfig.channel || undefined
  const spaFallback = options.static
    ? false
    : (options.spa ?? projectConfig.spaFallback ?? true)
  const password = options.password || process.env.YEEET_DEPLOY_PASSWORD
  if (password && (password.length < 8 || password.length > 128)) {
    const error = new Error('Passwords must be between 8 and 128 characters.')
    error.code = 'invalid_password'
    throw error
  }
  const files = await findFiles(targetPath)
  if (!files.length) throw new Error('No files found to deploy.')
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  await runConcurrent(files, 4, async (file) => {
    file.checksum = await sha256File(file.absolutePath)
  })

  if (!options.json && !options.dryRun) {
    console.log(
      `\n  ↑ Yeeeting ${files.length.toLocaleString()} files (${formatBytes(totalBytes)}) to ${slug ? `the named site “${slug}”` : 'a fresh random subdomain'}`,
    )
  }
  const manifest = files.map((file) => ({
    path: file.path,
    size: file.size,
    contentType: mime.lookup(file.path) || 'application/octet-stream',
    checksum: file.checksum,
  }))
  if (options.dryRun) {
    const plan = await apiRequest(
      '/api/v1/deployments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, channel, files: manifest, dryRun: true }),
      },
      options,
    )
    if (options.json) print(plan, true)
    else printDeploymentDiff(plan)
    return
  }

  const idempotencyKey = options.idempotencyKey || randomUUID()
  const createRequest = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      slug,
      channel,
      spaFallback,
      password,
      source: 'cli',
      files: manifest,
    }),
  }
  let deployment
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      deployment = await apiRequest(
        '/api/v1/deployments',
        createRequest,
        options,
      )
      break
    } catch (error) {
      if ((error.status == null || error.status >= 500) && attempt < 2) {
        await sleep(500 * (attempt + 1))
        continue
      }
      throw error
    }
  }
  const paths = new Map(files.map((file) => [file.path, file.absolutePath]))
  let uploaded = 0
  await runConcurrent(
    deployment.uploadUrls,
    Number(options.concurrency || 8),
    async (upload) => {
      const response = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: await readFile(paths.get(upload.path)),
      })
      if (!response.ok)
        throw new Error(
          `Upload failed for ${upload.path} (${response.status}).`,
        )
      uploaded += 1
      if (!options.json && process.stderr.isTTY) {
        process.stderr.write(
          `\r  → uploaded ${uploaded}/${deployment.uploadUrls.length}`,
        )
      }
    },
  )
  if (!options.json && process.stderr.isTTY) process.stderr.write('\n')

  let completed
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      completed = await apiRequest(
        deployment.completeUrl,
        { method: 'POST' },
        options,
      )
      break
    } catch (error) {
      if (error.code !== 'incomplete_upload' || attempt === 3) throw error
      await sleep(750 * (attempt + 1))
    }
  }

  if (options.json) {
    print(
      {
        status: completed.status,
        url: completed.url,
        versionUrl: completed.versionUrl,
        deployment: completed.id,
        files: files.length,
        bytes: totalBytes,
        site: completed.site,
        channel: completed.channel,
        spaFallback: completed.spaFallback,
        protected: completed.protected,
        shareUrl: completed.shareUrl,
        uploadedFiles: deployment.uploadedFiles,
        reusedFiles: deployment.reusedFiles,
        diff: deployment.diff,
        idempotent: deployment.idempotent,
      },
      true,
    )
  } else {
    console.log(`  ✓ Live at ${completed.url}\n`)
    if (completed.shareUrl) {
      console.log('  Private share link (no account or password required):')
      console.log(`  ${completed.shareUrl}\n`)
    }
  }
}

function printDomain(domain) {
  console.log(`\n  ${domain.hostname}`)
  console.log(`  Certificate: ${domain.certificateStatus}`)
  for (const record of domain.dnsRecords || []) {
    console.log(
      `  ${record.status === 'VALID' ? '✓' : '→'} ${record.hostlabel} CNAME ${record.requiredValue}`,
    )
  }
  if (domain.verificationToken) {
    console.log(
      `  → ${domain.verificationHost} TXT ${domain.verificationToken}`,
    )
  }
  console.log('')
}

async function domains(site, options) {
  const data = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/domains`,
    {},
    options,
  )
  if (options.json) return print(data, true)
  if (!data.domains.length) {
    return console.log(
      `No custom domains. Run \`yeeet domain add ${site} docs.example.com\`.`,
    )
  }
  for (const domain of data.domains) printDomain(domain)
}

async function addDomain(site, hostname, options) {
  const domain = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/domains`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: hostname }),
    },
    options,
  )
  if (options.json) return print(domain, true)
  console.log(`✓ ${domain.hostname} was attached. Add these DNS records:`)
  printDomain(domain)
}

async function findDomain(site, selector, options) {
  const data = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/domains`,
    {},
    options,
  )
  const matches = data.domains.filter(
    (domain) =>
      domain.id === selector ||
      domain.hostname === selector.toLowerCase() ||
      domain.id.startsWith(selector),
  )
  if (matches.length !== 1) {
    const error = new Error(
      matches.length
        ? 'That custom-domain selector is ambiguous.'
        : 'Custom domain not found.',
    )
    error.code = matches.length ? 'ambiguous_domain' : 'domain_not_found'
    throw error
  }
  return matches[0]
}

async function refreshDomain(site, selector, options) {
  const domain = await findDomain(site, selector, options)
  const refreshed = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/domains/${domain.id}/refresh`,
    { method: 'POST' },
    options,
  )
  if (options.json) return print(refreshed, true)
  printDomain(refreshed)
}

async function removeDomain(site, selector, options) {
  const domain = await findDomain(site, selector, options)
  const removed = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/domains/${domain.id}`,
    { method: 'DELETE' },
    options,
  )
  print(options.json ? removed : `✓ Removed ${removed.hostname}.`, options.json)
}

async function channels(site, options) {
  const data = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/channels`,
    {},
    options,
  )
  if (options.json) return print(data, true)
  if (!data.channels.length) {
    return console.log(
      `No channels. Run \`yeeet deploy ./dist --name ${site} --channel staging\`.`,
    )
  }
  console.log(`\n  Channels for ${data.site.url}\n`)
  for (const channel of data.channels) {
    console.log(
      `  ${channel.name.padEnd(18)} ${channel.deploymentId.slice(0, 8)}  ${channel.url}`,
    )
  }
  console.log('')
}

async function setChannel(site, channel, version, options) {
  const result = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/channels/${encodeURIComponent(channel)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version }),
    },
    options,
  )
  print(
    options.json
      ? result
      : `✓ ${result.site} --${result.channel} now points to ${result.deploymentId.slice(0, 8)} at ${result.url}`,
    options.json,
  )
}

async function removeChannel(site, channel, options) {
  const result = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/channels/${encodeURIComponent(channel)}`,
    { method: 'DELETE' },
    options,
  )
  print(
    options.json
      ? result
      : `✓ Removed the ${result.channel} channel from ${result.site}.`,
    options.json,
  )
}

async function webhooks(options) {
  const data = await apiRequest('/api/v1/webhooks', {}, options)
  if (options.json) return print(data, true)
  if (!data.webhooks.length) {
    return console.log(
      'No webhooks. Run `yeeet webhook add https://example.com/hook`.',
    )
  }
  console.log('\n  Webhooks\n')
  for (const webhook of data.webhooks) {
    console.log(
      `  ${webhook.id.slice(0, 8)}  ${(webhook.active ? 'active' : 'paused').padEnd(7)}  ${webhook.label}  ${webhook.url}`,
    )
    console.log(`            ${webhook.events.join(', ')}`)
  }
  console.log('')
}

async function addWebhook(url, options) {
  const result = await apiRequest(
    '/api/v1/webhooks',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        label: options.label,
        events: options.events
          ?.split(',')
          .map((event) => event.trim())
          .filter(Boolean),
      }),
    },
    options,
  )
  if (options.json) return print(result, true)
  console.log(`✓ Added ${result.label}: ${result.url}`)
  console.log('Signing secret (shown once):')
  console.log(result.secret)
}

async function findWebhook(selector, options) {
  const data = await apiRequest('/api/v1/webhooks', {}, options)
  const matches = data.webhooks.filter(
    (webhook) => webhook.id === selector || webhook.id.startsWith(selector),
  )
  if (matches.length !== 1) {
    const error = new Error(
      matches.length ? 'Webhook prefix is ambiguous.' : 'Webhook not found.',
    )
    error.code = matches.length ? 'ambiguous_webhook' : 'webhook_not_found'
    throw error
  }
  return matches[0]
}

async function removeWebhook(selector, options) {
  const webhook = await findWebhook(selector, options)
  const result = await apiRequest(
    `/api/v1/webhooks/${webhook.id}`,
    { method: 'DELETE' },
    options,
  )
  print(options.json ? result : `✓ Removed ${webhook.label}.`, options.json)
}

async function rotateWebhookSecret(selector, options) {
  const webhook = await findWebhook(selector, options)
  const result = await apiRequest(
    `/api/v1/webhooks/${webhook.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rotateSecret: true }),
    },
    options,
  )
  if (options.json) return print(result, true)
  console.log(`✓ Rotated ${result.label}. New signing secret (shown once):`)
  console.log(result.secret)
}

async function webhookDeliveries(options) {
  const data = await apiRequest('/api/v1/webhooks/deliveries', {}, options)
  if (options.json) return print(data, true)
  if (!data.deliveries.length) return console.log('No webhook deliveries yet.')
  console.log('\n  Recent webhook deliveries\n')
  for (const delivery of data.deliveries) {
    console.log(
      `  ${delivery.id.slice(0, 8)}  ${delivery.status.padEnd(9)}  ${delivery.event}  attempts:${delivery.attempts}`,
    )
  }
  console.log('')
}

async function analytics(site, options) {
  const days = Number(options.days || 30)
  const data = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/analytics?days=${encodeURIComponent(days)}`,
    {},
    options,
  )
  if (options.json) return print(data, true)
  console.log(
    `\n  ${data.totalViews.toLocaleString()} pageviews for ${data.site.url}`,
  )
  console.log(`  ${data.period.from} through ${data.period.to}\n`)
  for (const path of data.topPaths.slice(0, 10)) {
    console.log(`  ${String(path.views).padStart(7)}  ${path.path}`)
  }
  console.log('\n  Privacy: aggregate counts only; no visitor identifiers.\n')
}

async function versions(slug, options) {
  const data = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(slug)}/versions`,
    {},
    options,
  )
  if (options.json) return print(data, true)
  console.log(`\n  Versions for ${data.site.url}\n`)
  for (const version of data.versions) {
    const marker = version.current
      ? '● live'
      : version.status === 'ready'
        ? '○ ready'
        : `! ${version.status}`
    console.log(
      `  ${marker.padEnd(10)} ${version.id.slice(0, 8)}  ${(version.protected ? 'private' : 'public').padEnd(7)}  ${String(version.fileCount).padStart(5)} files  ${formatBytes(version.totalBytes).padStart(9)}  ${version.createdAt}`,
    )
    if (version.previewUrl) console.log(`             ${version.previewUrl}`)
    if (version.shareUrl) console.log(`     share → ${version.shareUrl}`)
  }
  console.log('')
}

function confirmationRequired(options, description) {
  if (options.yes) return
  const error = new Error(`${description} Re-run with --yes to confirm.`)
  error.code = 'confirmation_required'
  throw error
}

async function removeSite(site, options) {
  confirmationRequired(
    options,
    `Deleting ${site} removes every version, custom domain mapping, and stored file.`,
  )
  const removed = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}`,
    { method: 'DELETE' },
    options,
  )
  print(
    options.json
      ? removed
      : `✓ Deleted ${removed.slug} and ${removed.deletedObjects} stored file${removed.deletedObjects === 1 ? '' : 's'}.`,
    options.json,
  )
}

async function removeVersion(site, version, options) {
  confirmationRequired(
    options,
    `Deleting version ${version} removes its stored files.`,
  )
  const removed = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/versions/${encodeURIComponent(version)}`,
    { method: 'DELETE' },
    options,
  )
  print(
    options.json
      ? removed
      : `✓ Deleted ${removed.id.slice(0, 8)}.${removed.wasActive ? ` ${removed.activeDeploymentId ? `${removed.activeDeploymentId.slice(0, 8)} is now live.` : 'The site has no live version.'}` : ''}`,
    options.json,
  )
}

async function updateVersionAccess(site, version, input, options) {
  const result = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/versions/${encodeURIComponent(version)}/access`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  )
  if (options.json) return print(result, true)
  if (!result.protected) {
    return console.log(`✓ ${result.id.slice(0, 8)} is public.`)
  }
  console.log(`✓ ${result.id.slice(0, 8)} is password protected.`)
  console.log(`Share without a password: ${result.shareUrl}`)
}

async function protectVersion(site, version, options) {
  const password = options.password || process.env.YEEET_DEPLOY_PASSWORD
  if (!password) {
    const error = new Error('Provide --password or set YEEET_DEPLOY_PASSWORD.')
    error.code = 'password_required'
    throw error
  }
  if (password.length < 8 || password.length > 128) {
    const error = new Error('Passwords must be between 8 and 128 characters.')
    error.code = 'invalid_password'
    throw error
  }
  return updateVersionAccess(site, version, { password }, options)
}

async function shareVersion(site, selector, options) {
  if (selector && selector.length < 8) {
    const error = new Error('Use at least 8 characters of the version ID.')
    error.code = 'invalid_version'
    throw error
  }
  const history = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(site)}/versions`,
    {},
    options,
  )
  const normalized = selector?.toLowerCase()
  const matches = selector
    ? history.versions.filter(
        (version) =>
          version.id === normalized || version.id.startsWith(normalized),
      )
    : history.versions.filter((version) => version.current)
  if (matches.length !== 1) {
    const error = new Error(
      matches.length
        ? 'That version selector is ambiguous.'
        : 'Version not found.',
    )
    error.code = matches.length ? 'ambiguous_version' : 'version_not_found'
    throw error
  }
  const version = matches[0]
  if (!version.shareUrl) {
    const error = new Error(
      `Version ${version.id.slice(0, 8)} is public. Protect it first to create a private share link.`,
    )
    error.code = 'version_is_public'
    throw error
  }
  print(
    options.json
      ? { site, deployment: version.id, shareUrl: version.shareUrl }
      : version.shareUrl,
    options.json,
  )
}

async function rollback(slug, selector, options) {
  let versionId = selector
  if (!versionId) {
    const history = await apiRequest(
      `/api/v1/sites/${encodeURIComponent(slug)}/versions`,
      {},
      options,
    )
    const currentIndex = history.versions.findIndex(
      (version) => version.current,
    )
    const previous = history.versions
      .slice(currentIndex + 1)
      .find((version) => version.status === 'ready')
    if (!previous) {
      const error = new Error('No previous ready version is available.')
      error.code = 'no_previous_version'
      throw error
    }
    versionId = previous.id
  }

  const result = await apiRequest(
    `/api/v1/sites/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionId)}/activate`,
    { method: 'POST' },
    options,
  )
  print(
    options.json
      ? result
      : `✓ ${result.id.slice(0, 8)} is live at ${result.url}`,
    options.json,
  )
}

function formatBytes(value) {
  const units = ['B', 'KB', 'MB', 'GB']
  const rank = Math.min(
    Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

const program = new Command()
  .name('yeeet')
  .description('Static sites at terminal velocity.')
  .version(VERSION)
  .option('--api <url>', 'Yeeet API URL')
  .option('--json', 'print machine-readable JSON')

program
  .command('login')
  .description('Log in through a browser using a one-time device code')
  .option('--no-open', 'do not open a browser')
  .action(async (options) => login({ ...program.opts(), ...options }))

program
  .command('logout')
  .description('Remove the locally stored session')
  .action(async () => {
    const saved = await readConfig()
    await writeConfig({ ...saved, token: undefined })
    print(
      program.opts().json ? { status: 'logged_out' } : '✓ Logged out.',
      program.opts().json,
    )
  })

program
  .command('whoami')
  .description('Show the current account')
  .action(async () => {
    const data = await apiRequest('/api/v1/me', {}, program.opts())
    print(
      program.opts().json
        ? data
        : `${data.user?.name || 'Yeeet user'}${data.user?.email ? ` <${data.user.email}>` : ''}`,
      program.opts().json,
    )
  })

program
  .command('sites')
  .description('List your live sites')
  .action(async () => {
    const data = await apiRequest('/api/v1/sites', {}, program.opts())
    if (program.opts().json) return print(data, true)
    if (!data.sites.length)
      return console.log('No sites yet. Run `yeeet deploy ./dist`.')
    for (const site of data.sites)
      console.log(
        `${site.slug.padEnd(24)} ${(site.protected ? 'private' : 'public').padEnd(7)} ${site.url}`,
      )
  })

program
  .command('deploy')
  .alias('up')
  .argument('[path]', 'file or directory to deploy', '.')
  .option('-n, --name <slug>', 'subdomain name (or use .yeeet.json)')
  .option(
    '--channel <name>',
    'update a no-index deployment channel instead of production',
  )
  .option('--dry-run', 'show the deployment diff without creating or uploading')
  .option(
    '--idempotency-key <key>',
    'resume this exact deployment safely on retry',
  )
  .option('-c, --concurrency <number>', 'parallel uploads', '8')
  .option('--spa', 'serve index.html for client-side routes')
  .option('--static', 'return 404 for paths without a matching file')
  .option(
    '--password <password>',
    'password protect this deployment (or set YEEET_DEPLOY_PASSWORD)',
  )
  .description('Deploy a file or folder')
  .action(async (target, options) =>
    deploy(target, { ...program.opts(), ...options }),
  )

program
  .command('versions')
  .argument('<site>', 'site name')
  .description('List immutable versions and preview URLs')
  .action(async (site) => versions(site, program.opts()))

program
  .command('analytics')
  .argument('<site>', 'site name')
  .option('--days <number>', 'report window from 1 to 90 days', '30')
  .description('Show privacy-preserving aggregate pageviews and top paths')
  .action(async (site, options) =>
    analytics(site, { ...program.opts(), ...options }),
  )

program
  .command('rollback')
  .argument('<site>', 'site name')
  .argument('[version]', 'full version ID or an 8+ character prefix')
  .description('Make a previous version live atomically')
  .action(async (site, version) => rollback(site, version, program.opts()))

program
  .command('remove')
  .alias('rm')
  .argument('<site>', 'site name')
  .option('-y, --yes', 'confirm permanent deletion')
  .description('Delete a site and every version')
  .action(async (site, options) =>
    removeSite(site, { ...program.opts(), ...options }),
  )

const versionCommand = program
  .command('version')
  .description('Manage an individual deployment version')

versionCommand
  .command('remove')
  .alias('rm')
  .argument('<site>', 'site name')
  .argument('<version>', 'full version ID or an 8+ character prefix')
  .option('-y, --yes', 'confirm permanent deletion')
  .description('Delete one version and its stored files')
  .action(async (site, version, options) =>
    removeVersion(site, version, { ...program.opts(), ...options }),
  )

const accessCommand = program
  .command('access')
  .description('Manage password protection and private share links')

accessCommand
  .command('protect')
  .argument('<site>', 'site name')
  .argument('<version>', 'full version ID or an 8+ character prefix')
  .option(
    '--password <password>',
    'deployment password (or set YEEET_DEPLOY_PASSWORD)',
  )
  .description('Password protect a version and create a share link')
  .action(async (site, version, options) =>
    protectVersion(site, version, { ...program.opts(), ...options }),
  )

accessCommand
  .command('public')
  .argument('<site>', 'site name')
  .argument('<version>', 'full version ID or an 8+ character prefix')
  .description('Remove password protection from a version')
  .action(async (site, version) =>
    updateVersionAccess(site, version, { password: null }, program.opts()),
  )

accessCommand
  .command('rotate-link')
  .argument('<site>', 'site name')
  .argument('<version>', 'full version ID or an 8+ character prefix')
  .description('Invalidate the old private share link and create a new one')
  .action(async (site, version) =>
    updateVersionAccess(
      site,
      version,
      { rotateShareLink: true },
      program.opts(),
    ),
  )

program
  .command('share')
  .argument('<site>', 'site name')
  .argument('[version]', 'version ID or prefix (defaults to live)')
  .description('Print a private one-click share link')
  .action(async (site, version) => shareVersion(site, version, program.opts()))

const channelCommand = program
  .command('channel')
  .description('Manage mutable deployment channels such as staging')

channelCommand
  .command('list')
  .argument('<site>', 'site name')
  .description('List deployment channels')
  .action(async (site) => channels(site, program.opts()))

channelCommand
  .command('set')
  .argument('<site>', 'site name')
  .argument('<channel>', 'channel name')
  .argument('<version>', 'full version ID or an 8+ character prefix')
  .description('Point a channel at a ready immutable version')
  .action(async (site, channel, version) =>
    setChannel(site, channel, version, program.opts()),
  )

channelCommand
  .command('remove')
  .alias('rm')
  .argument('<site>', 'site name')
  .argument('<channel>', 'channel name')
  .description('Remove a deployment channel without deleting its version')
  .action(async (site, channel) => removeChannel(site, channel, program.opts()))

const webhookCommand = program
  .command('webhook')
  .description('Manage signed deployment event webhooks')

webhookCommand
  .command('list')
  .description('List webhook endpoints and event subscriptions')
  .action(async () => webhooks(program.opts()))

webhookCommand
  .command('add')
  .argument('<url>', 'public HTTPS endpoint')
  .option('--label <label>', 'readable endpoint label')
  .option('--events <events>', 'comma-separated events (defaults to *)')
  .description('Create a webhook and show its signing secret once')
  .action(async (url, options) =>
    addWebhook(url, { ...program.opts(), ...options }),
  )

webhookCommand
  .command('rotate-secret')
  .argument('<webhook>', 'webhook ID or prefix')
  .description('Rotate the signing secret and show the replacement once')
  .action(async (webhook) => rotateWebhookSecret(webhook, program.opts()))

webhookCommand
  .command('remove')
  .alias('rm')
  .argument('<webhook>', 'webhook ID or prefix')
  .description('Remove a webhook and its delivery history')
  .action(async (webhook) => removeWebhook(webhook, program.opts()))

webhookCommand
  .command('deliveries')
  .description('List recent webhook delivery attempts')
  .action(async () => webhookDeliveries(program.opts()))

const domainCommand = program
  .command('domain')
  .description('Manage custom domains and Railway-managed TLS')

domainCommand
  .command('list')
  .argument('<site>', 'site name')
  .description('List custom domains and DNS status')
  .action(async (site) => domains(site, program.opts()))

domainCommand
  .command('add')
  .argument('<site>', 'site name')
  .argument('<hostname>', 'custom hostname, without https://')
  .description('Attach a custom domain')
  .action(async (site, hostname) => addDomain(site, hostname, program.opts()))

domainCommand
  .command('refresh')
  .argument('<site>', 'site name')
  .argument('<domain>', 'hostname, ID, or ID prefix')
  .description('Refresh DNS and certificate status')
  .action(async (site, domain) => refreshDomain(site, domain, program.opts()))

domainCommand
  .command('remove')
  .alias('rm')
  .argument('<site>', 'site name')
  .argument('<domain>', 'hostname, ID, or ID prefix')
  .description('Detach a custom domain')
  .action(async (site, domain) => removeDomain(site, domain, program.opts()))

program
  .command('init')
  .argument('[name]', 'default site name')
  .description('Create .yeeet.json in the current directory')
  .action(async (name) => {
    const slug = name ? safeName(name) : undefined
    const projectConfig = { ...(slug ? { name: slug } : {}), spaFallback: true }
    await writeFile(
      resolve('.yeeet.json'),
      `${JSON.stringify(projectConfig, null, 2)}\n`,
    )
    print(
      program.opts().json
        ? { status: 'initialized', ...projectConfig }
        : `✓ Created .yeeet.json${slug ? ` for ${slug}` : ' with random site naming'}.`,
      program.opts().json,
    )
  })

program.parseAsync().catch((error) => {
  if (program.opts().json) {
    console.error(
      JSON.stringify({
        error: {
          code: error.code || 'cli_error',
          message: error.message,
          details: error.details,
        },
      }),
    )
  } else {
    console.error(`\n  ✗ ${error.message}\n`)
  }
  process.exitCode = error.status === 401 ? 2 : 1
})
