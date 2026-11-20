const numberFormatter = new Intl.NumberFormat('en-US')
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const utcMonthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatBytes(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const rank = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatDateTime(
  value: string | null | undefined,
  fallback = 'never',
) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return `${dateTimeFormatter.format(date)} UTC`
}

export function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return shortDateFormatter.format(date)
}

export function formatUtcMonthDay(isoDate: string) {
  return utcMonthDayFormatter.format(new Date(`${isoDate}T00:00:00Z`))
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function safeRedirectPath(
  value: string | undefined,
  fallback = '/dashboard',
) {
  if (!value) return fallback
  const trimmed = value.trim()
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    hasControlCharacter(trimmed)
  ) {
    return fallback
  }
  try {
    const parsed = new URL(trimmed, 'https://yeeet.local')
    if (parsed.origin !== 'https://yeeet.local') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
