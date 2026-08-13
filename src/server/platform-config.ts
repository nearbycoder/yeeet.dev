const DEFAULT_CONTROL_PLANE_URL = 'https://yeeet.dev'
const DEFAULT_SITE_DOMAIN = 'site.yeeet.dev'
const DEFAULT_DOCS_HOST = 'docs.yeeet.dev'

function hostnameProtocol(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
    ? 'http'
    : 'https'
}

export function controlPlaneUrl() {
  const fallback =
    process.env.NODE_ENV === 'production'
      ? DEFAULT_CONTROL_PLANE_URL
      : 'http://localhost:3000'
  return new URL(process.env.BETTER_AUTH_URL?.trim() || fallback).origin
}

export function siteDomain() {
  return (process.env.SITE_DOMAIN?.trim() || DEFAULT_SITE_DOMAIN).toLowerCase()
}

export function docsHost() {
  return (process.env.DOCS_HOST?.trim() || DEFAULT_DOCS_HOST).toLowerCase()
}

export function docsUrl() {
  const host = docsHost()
  return `${hostnameProtocol(host)}://${host}`
}

export function siteUrl(slug: string) {
  const host = siteDomain()
  return `${hostnameProtocol(host)}://${slug}.${host}`
}

export function siteWildcardOrigin() {
  const host = siteDomain()
  return `${hostnameProtocol(host)}://*.${host}`
}

export function publicPlatformConfig() {
  return {
    controlPlaneUrl: controlPlaneUrl(),
    docsUrl: docsUrl(),
    siteDomain: siteDomain(),
  }
}
