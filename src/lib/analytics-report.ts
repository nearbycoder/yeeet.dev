import { toCsv } from './download'

export type AnalyticsDay = { date: string; views: number }
export type AnalyticsRow = AnalyticsDay & { path: string; status: number }

export function analyticsPeriod(
  rows: Array<AnalyticsRow>,
  days: number,
  now = new Date(),
) {
  const dateAt = (offset: number) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() + offset)
    return date.toISOString().slice(0, 10)
  }
  const period = { days, from: dateAt(1 - days), to: dateAt(0) }
  const previousPeriod = { days, from: dateAt(1 - days * 2), to: dateAt(-days) }
  function summarize(from: string, to: string) {
    const daily = new Map<string, number>(),
      paths = new Map<string, number>()
    const statuses = { successful: 0, redirects: 0, errors: 0 }
    let totalViews = 0
    for (const row of rows) {
      if (row.date < from || row.date > to) continue
      totalViews += row.views
      daily.set(row.date, (daily.get(row.date) ?? 0) + row.views)
      paths.set(row.path, (paths.get(row.path) ?? 0) + row.views)
      if (row.status >= 400) statuses.errors += row.views
      else if (row.status >= 300) statuses.redirects += row.views
      else statuses.successful += row.views
    }
    return {
      totalViews,
      statuses,
      daily: Array.from({ length: days }, (_, index) => {
        const date = new Date(`${from}T00:00:00Z`)
        date.setUTCDate(date.getUTCDate() + index)
        const key = date.toISOString().slice(0, 10)
        return { date: key, views: daily.get(key) ?? 0 }
      }),
      topPaths: [...paths.entries()]
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
        .slice(0, 20),
    }
  }
  return {
    period,
    ...summarize(period.from, period.to),
    comparison: {
      period: previousPeriod,
      ...summarize(previousPeriod.from, previousPeriod.to),
    },
  }
}
export function aggregateWeeks(daily: Array<AnalyticsDay>) {
  const weeks = new Map<string, AnalyticsDay>()
  for (const day of daily) {
    const date = new Date(`${day.date}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    const key = date.toISOString().slice(0, 10)
    weeks.set(key, {
      date: key,
      views: (weeks.get(key)?.views ?? 0) + day.views,
    })
  }
  return [...weeks.values()]
}

export function periodChange(current: number, previous: number) {
  if (!previous) return current ? 'New traffic' : 'No change'
  const change = ((current - previous) / previous) * 100
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
}

export function analyticsCsv(data: {
  daily: Array<AnalyticsDay>
  topPaths: Array<{ path: string; views: number }>
  statuses: { successful: number; redirects: number; errors: number }
}) {
  return toCsv([
    ['section', 'date_or_path', 'views'],
    ...data.daily.map((day) => ['daily', day.date, day.views]),
    ...data.topPaths.map((item) => ['top_path', item.path, item.views]),
    ...Object.entries(data.statuses).map(([status, views]) => [
      'status',
      status,
      views,
    ]),
  ])
}
