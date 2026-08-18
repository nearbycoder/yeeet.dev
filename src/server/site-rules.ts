import { HttpError } from './http'

export const HEADERS_FILE = '_headers'
export const REDIRECTS_FILE = '_redirects'
export const SITE_RULE_FILES = [HEADERS_FILE, REDIRECTS_FILE] as const

const MAX_RULE_FILE_BYTES = 64 * 1024
const MAX_RULES = 100
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const BLOCKED_HEADERS = new Set([
  'accept-ranges',
  'connection',
  'content-encoding',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'keep-alive',
  'location',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-content-type-options',
  'x-yeeet-deployment',
])
const REDIRECT_STATUSES = new Set([200, 301, 302, 303, 307, 308])

export type SiteHeaderRule = {
  headers: Array<{ name: string; value: string }>
  path: string
}

export type SiteRedirectRule = {
  from: string
  status: 200 | 301 | 302 | 303 | 307 | 308
  to: string
}

function ruleError(file: string, line: number, message: string) {
  return new HttpError(400, `${file}:${line}: ${message}`, 'invalid_site_rules')
}

function meaningfulLines(value: string) {
  if (Buffer.byteLength(value) > MAX_RULE_FILE_BYTES) {
    throw new HttpError(
      400,
      `Site rule files may not exceed ${MAX_RULE_FILE_BYTES / 1024} KB.`,
      'site_rules_too_large',
    )
  }
  return value.replaceAll('\r\n', '\n').split('\n')
}

function validatePathPattern(value: string, file: string, line: number) {
  if (!value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw ruleError(
      file,
      line,
      'paths must begin with / and use URL separators',
    )
  }
  if (value.includes('?') || value.includes('#')) {
    throw ruleError(
      file,
      line,
      'path patterns cannot contain a query or fragment',
    )
  }
  if ((value.match(/\*/g) ?? []).length > 1) {
    throw ruleError(
      file,
      line,
      'path patterns may contain at most one wildcard',
    )
  }
  return value
}

export function parseHeaderRules(value: string): Array<SiteHeaderRule> {
  const rules: Array<SiteHeaderRule> = []
  let current: SiteHeaderRule | undefined

  meaningfulLines(value).forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    if (!/^\s/.test(raw)) {
      current = {
        path: validatePathPattern(trimmed, HEADERS_FILE, line),
        headers: [],
      }
      rules.push(current)
      if (rules.length > MAX_RULES) {
        throw ruleError(
          HEADERS_FILE,
          line,
          `at most ${MAX_RULES} rules are allowed`,
        )
      }
      return
    }

    if (!current) {
      throw ruleError(HEADERS_FILE, line, 'a header must follow a path pattern')
    }
    const separator = trimmed.indexOf(':')
    if (separator < 1) {
      throw ruleError(HEADERS_FILE, line, 'expected Header-Name: value')
    }
    const name = trimmed.slice(0, separator).trim()
    const lowerName = name.toLowerCase()
    const headerValue = trimmed.slice(separator + 1).trim()
    if (!HEADER_NAME.test(name)) {
      throw ruleError(HEADERS_FILE, line, `invalid header name ${name}`)
    }
    if (BLOCKED_HEADERS.has(lowerName)) {
      throw ruleError(HEADERS_FILE, line, `${name} is controlled by Yeeet`)
    }
    if (!headerValue || /[\r\n]/.test(headerValue)) {
      throw ruleError(HEADERS_FILE, line, `${name} needs a safe value`)
    }
    current.headers.push({ name: lowerName, value: headerValue.slice(0, 4096) })
  })

  return rules.filter((rule) => rule.headers.length)
}

export function parseRedirectRules(value: string): Array<SiteRedirectRule> {
  const rules: Array<SiteRedirectRule> = []
  meaningfulLines(value).forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2 || parts.length > 3) {
      throw ruleError(REDIRECTS_FILE, line, 'expected: /from /to [status]')
    }
    const from = validatePathPattern(parts[0], REDIRECTS_FILE, line)
    const to = parts[1]
    const status = Number(parts[2] ?? 301)
    if (!REDIRECT_STATUSES.has(status)) {
      throw ruleError(
        REDIRECTS_FILE,
        line,
        'status must be 200, 301, 302, 303, 307, or 308',
      )
    }
    const external = /^https?:\/\//i.test(to)
    if (!external && !to.startsWith('/')) {
      throw ruleError(
        REDIRECTS_FILE,
        line,
        'destinations must be paths or HTTP(S) URLs',
      )
    }
    if (status === 200 && (external || to.startsWith('//'))) {
      throw ruleError(
        REDIRECTS_FILE,
        line,
        'external proxy rewrites are not supported',
      )
    }
    rules.push({ from, to, status: status as SiteRedirectRule['status'] })
    if (rules.length > MAX_RULES) {
      throw ruleError(
        REDIRECTS_FILE,
        line,
        `at most ${MAX_RULES} rules are allowed`,
      )
    }
  })
  return rules
}

function matchPattern(pattern: string, pathname: string) {
  const names: Array<string> = []
  const expression = pattern
    .split('/')
    .map((segment) => {
      if (segment === '*') {
        names.push('splat')
        return '(.*)'
      }
      if (segment.startsWith(':') && segment.length > 1) {
        names.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  const match = new RegExp(`^${expression}$`).exec(pathname)
  if (!match) return null
  return Object.fromEntries(
    names.map((name, index) => [name, match[index + 1] ?? '']),
  )
}

function substitute(value: string, params: Record<string, string>) {
  let result = value
  for (const [name, replacement] of Object.entries(params)) {
    result = result.replaceAll(`:${name}`, replacement)
  }
  return result
}

export function matchingHeaders(
  rules: Array<SiteHeaderRule>,
  pathname: string,
) {
  return rules.flatMap((rule) =>
    matchPattern(rule.path, pathname) ? rule.headers : [],
  )
}

export function applySiteHeaders(
  headers: Headers,
  rules: Array<SiteHeaderRule>,
  pathname: string,
) {
  for (const header of matchingHeaders(rules, pathname)) {
    headers.set(header.name, header.value)
  }
}

export function matchingRedirect(
  rules: Array<SiteRedirectRule>,
  pathname: string,
) {
  for (const rule of rules) {
    const params = matchPattern(rule.from, pathname)
    if (params) return { ...rule, to: substitute(rule.to, params) }
  }
  return null
}

export function deserializeSiteRules<T>(value: string, fallback: Array<T>) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as Array<T>) : fallback
  } catch {
    return fallback
  }
}
