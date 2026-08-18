#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import fg from 'fast-glob'
import mime from 'mime-types'
import * as z from 'zod/v4'

const VERSION = '0.0.1'
const DEFAULT_API = 'https://yeeet.dev'

function apiOrigin() {
  return (process.env.YEEET_API || DEFAULT_API).replace(/\/+$/, '')
}

function token() {
  const value = process.env.YEEET_TOKEN
  if (!value)
    throw new Error('Set YEEET_TOKEN to a Yeeet API key before using tools.')
  return value
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${token()}`)
  headers.set('user-agent', `yeeet-mcp/${VERSION}`)
  headers.set('x-yeeet-client', `mcp/${VERSION}`)
  const response = await fetch(`${apiOrigin()}${path}`, { ...options, headers })
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
        `Yeeet API returned ${response.status}.`,
    )
    error.code = data.error?.code || 'api_error'
    error.status = response.status
    error.details = data.error?.details
    throw error
  }
  return data
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
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

async function deploymentFiles(target) {
  const targetPath = resolve(target)
  const targetInfo = await stat(targetPath)
  let files
  if (targetInfo.isFile()) {
    files = [
      {
        path: basename(targetPath),
        absolutePath: targetPath,
        size: targetInfo.size,
      },
    ]
  } else if (targetInfo.isDirectory()) {
    const ignoreFile = await readFile(
      join(targetPath, '.yeeetignore'),
      'utf8',
    ).catch(() => '')
    const matches = await fg('**/*', {
      cwd: targetPath,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      ignore: [
        '.git/**',
        'node_modules/**',
        '.DS_Store',
        '.yeeetignore',
        ...ignoreFile
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#')),
      ],
    })
    files = await Promise.all(
      matches.sort().map(async (path) => {
        const absolutePath = join(targetPath, ...path.split('/'))
        return { path, absolutePath, size: (await stat(absolutePath)).size }
      }),
    )
  } else {
    throw new Error(`${target} is not a file or directory.`)
  }
  if (!files.length) throw new Error('No files found to deploy.')
  await runConcurrent(files, 4, async (file) => {
    file.checksum = await sha256File(file.absolutePath)
  })
  return files
}

export async function deployStaticPath(input) {
  const files = await deploymentFiles(input.path)
  const manifest = files.map((file) => ({
    path: file.path,
    size: file.size,
    contentType: mime.lookup(file.path) || 'application/octet-stream',
    checksum: file.checksum,
  }))
  const createBody = {
    slug: input.site,
    channel: input.channel,
    spaFallback: input.spaFallback ?? true,
    source: 'api',
    files: manifest,
    dryRun: Boolean(input.dryRun),
  }
  const key = input.idempotencyKey || randomUUID()
  const deployment = await apiRequest('/api/v1/deployments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.dryRun ? {} : { 'idempotency-key': key }),
    },
    body: JSON.stringify(createBody),
  })
  if (input.dryRun) return deployment

  const localFiles = new Map(
    files.map((file) => [file.path, file.absolutePath]),
  )
  await runConcurrent(deployment.uploadUrls, 8, async (upload) => {
    const filePath = localFiles.get(upload.path)
    if (!filePath)
      throw new Error(`The API requested an unknown path: ${upload.path}`)
    const response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: await readFile(filePath),
    })
    if (!response.ok)
      throw new Error(`Upload failed for ${upload.path} (${response.status}).`)
  })

  let completed
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      completed = await apiRequest(deployment.completeUrl, { method: 'POST' })
      break
    } catch (error) {
      if (error.code !== 'incomplete_upload' || attempt === 3) throw error
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, 750 * (attempt + 1)),
      )
    }
  }
  return {
    ...completed,
    files: files.length,
    uploadedFiles: deployment.uploadedFiles,
    reusedFiles: deployment.reusedFiles,
    diff: deployment.diff,
    idempotencyKey: key,
  }
}

export function resolveVersion(versions, selector) {
  if (!selector) return versions.find((version) => version.current) ?? null
  const normalized = selector.toLowerCase()
  const matches = versions.filter(
    (version) => version.id === normalized || version.id.startsWith(normalized),
  )
  if (matches.length !== 1) {
    throw new Error(
      matches.length ? 'Version prefix is ambiguous.' : 'Version not found.',
    )
  }
  return matches[0]
}

function toolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : { result: value },
  }
}

function toolError(error) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: {
              code: error?.code || 'tool_error',
              message: error instanceof Error ? error.message : String(error),
              details: error?.details,
            },
          },
          null,
          2,
        ),
      },
    ],
  }
}

function register(server, name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      return toolResult(await handler(input))
    } catch (error) {
      return toolError(error)
    }
  })
}

export function createYeeetMcpServer() {
  const server = new McpServer(
    { name: 'yeeet', version: VERSION },
    {
      instructions:
        'Use plan_deploy before updating an existing named site. Immutable versions are safe to inspect. Deletion tools require confirm=true and are permanent. Never print YEEET_TOKEN.',
    },
  )

  register(
    server,
    'list_sites',
    {
      description: 'List every Yeeet site owned by the authenticated account.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () => apiRequest('/api/v1/sites'),
  )
  register(
    server,
    'list_versions',
    {
      description:
        'List immutable versions, preview URLs, and the live version for a site.',
      inputSchema: z.object({ site: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    ({ site }) =>
      apiRequest(`/api/v1/sites/${encodeURIComponent(site)}/versions`),
  )
  register(
    server,
    'plan_deploy',
    {
      description:
        'Hash a local static path and return added, changed, removed, unchanged, and byte totals without creating a deployment.',
      inputSchema: z.object({
        path: z.string().min(1),
        site: z.string().min(1).optional(),
        channel: z.string().min(1).optional(),
        spaFallback: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    (input) => deployStaticPath({ ...input, dryRun: true }),
  )
  register(
    server,
    'deploy_path',
    {
      description:
        'Atomically deploy a local static file or folder. Omit site for a random subdomain; use channel to leave production untouched.',
      inputSchema: z.object({
        path: z.string().min(1),
        site: z.string().min(1).optional(),
        channel: z.string().min(1).optional(),
        spaFallback: z.boolean().optional(),
        idempotencyKey: z.string().min(1).max(128).optional(),
      }),
    },
    deployStaticPath,
  )
  register(
    server,
    'rollback_site',
    {
      description:
        'Make a ready immutable version the production version for a site.',
      inputSchema: z.object({
        site: z.string().min(1),
        version: z.string().min(8),
      }),
    },
    ({ site, version }) =>
      apiRequest(
        `/api/v1/sites/${encodeURIComponent(site)}/versions/${encodeURIComponent(version)}/activate`,
        { method: 'POST' },
      ),
  )
  register(
    server,
    'list_channels',
    {
      description: 'List mutable no-index deployment channels for a site.',
      inputSchema: z.object({ site: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    ({ site }) =>
      apiRequest(`/api/v1/sites/${encodeURIComponent(site)}/channels`),
  )
  register(
    server,
    'set_channel',
    {
      description:
        'Point a mutable no-index channel at a ready immutable version.',
      inputSchema: z.object({
        site: z.string().min(1),
        channel: z.string().min(1),
        version: z.string().min(8),
      }),
    },
    ({ site, channel, version }) =>
      apiRequest(
        `/api/v1/sites/${encodeURIComponent(site)}/channels/${encodeURIComponent(channel)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version }),
        },
      ),
  )
  register(
    server,
    'remove_channel',
    {
      description:
        'Remove a channel alias without deleting its immutable version.',
      inputSchema: z.object({
        site: z.string().min(1),
        channel: z.string().min(1),
      }),
    },
    ({ site, channel }) =>
      apiRequest(
        `/api/v1/sites/${encodeURIComponent(site)}/channels/${encodeURIComponent(channel)}`,
        { method: 'DELETE' },
      ),
  )
  register(
    server,
    'get_share_link',
    {
      description:
        'Return the one-click share URL for a private version. Omit version to use production.',
      inputSchema: z.object({
        site: z.string().min(1),
        version: z.string().min(8).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ site, version }) => {
      const history = await apiRequest(
        `/api/v1/sites/${encodeURIComponent(site)}/versions`,
      )
      const selected = resolveVersion(history.versions, version)
      if (!selected) throw new Error('This site has no live version.')
      if (!selected.shareUrl)
        throw new Error('That version is public; protect it first.')
      return { site, deploymentId: selected.id, shareUrl: selected.shareUrl }
    },
  )
  register(
    server,
    'list_domains',
    {
      description: 'List custom domains and their DNS/TLS state for a site.',
      inputSchema: z.object({ site: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    ({ site }) =>
      apiRequest(`/api/v1/sites/${encodeURIComponent(site)}/domains`),
  )
  register(
    server,
    'add_domain',
    {
      description:
        'Attach a custom domain and return required DNS ownership records.',
      inputSchema: z.object({
        site: z.string().min(1),
        domain: z.string().min(1),
      }),
    },
    ({ site, domain }) =>
      apiRequest(`/api/v1/sites/${encodeURIComponent(site)}/domains`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      }),
  )
  register(
    server,
    'delete_version',
    {
      description:
        'Permanently delete one immutable version and its stored objects.',
      inputSchema: z.object({
        site: z.string().min(1),
        version: z.string().min(8),
        confirm: z.literal(true),
      }),
      annotations: { destructiveHint: true },
    },
    ({ site, version }) =>
      apiRequest(
        `/api/v1/sites/${encodeURIComponent(site)}/versions/${encodeURIComponent(version)}`,
        { method: 'DELETE' },
      ),
  )
  register(
    server,
    'delete_site',
    {
      description:
        'Permanently delete a site, every version, custom-domain mapping, and stored object.',
      inputSchema: z.object({
        site: z.string().min(1),
        confirm: z.literal(true),
      }),
      annotations: { destructiveHint: true },
    },
    ({ site }) =>
      apiRequest(`/api/v1/sites/${encodeURIComponent(site)}`, {
        method: 'DELETE',
      }),
  )

  return server
}

const invokedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false
if (invokedPath) {
  void serveStdio(() => createYeeetMcpServer())
  console.error('Yeeet MCP server listening on stdio')
}
