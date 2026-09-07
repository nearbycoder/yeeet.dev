import type { ManifestDiffData } from '#/components/manifest-diff'

type Comparison = ManifestDiffData & {
  target: string
  base: string | null
  routingChanged: boolean
  headersChanged: boolean
  redirectsChanged: boolean
}
function inline(value: string) {
  const content = JSON.stringify(value).slice(1, -1)
  const fence = '`'.repeat(
    Math.max(
      0,
      ...[...content.matchAll(/`+/g)].map((match) => match[0].length),
    ) + 1,
  )
  return `${fence} ${content} ${fence}`
}
export function comparisonReport(
  site: string,
  diff: Comparison,
  format: 'json' | 'md',
) {
  const report = {
    schemaVersion: 1,
    site,
    base: diff.base,
    target: diff.target,
    added: diff.added,
    changed: diff.changed,
    removed: diff.removed,
    unchanged: diff.unchanged,
    summary: diff.summary,
    routingChanged: diff.routingChanged,
    headersChanged: diff.headersChanged,
    redirectsChanged: diff.redirectsChanged,
  }
  if (format === 'json') return JSON.stringify(report, null, 2)
  return (
    [
      `# Deployment comparison`,
      `Site: ${inline(site)}`,
      `Base: ${diff.base ? inline(diff.base) : 'Empty build'}`,
      `Target: ${inline(diff.target)}`,
      `Added/changed bytes: ${diff.summary.uploadBytes}. Unchanged bytes: ${diff.summary.unchangedBytes}.`,
      `Routing changed: ${diff.routingChanged}. Headers changed: ${diff.headersChanged}. Redirects changed: ${diff.redirectsChanged}.`,
      ...(['added', 'changed', 'removed', 'unchanged'] as const).flatMap(
        (kind) => [
          `## ${kind} (${diff[kind].length})`,
          ...diff[kind].map((path) => `- ${inline(path)}`),
        ],
      ),
    ].join('\n\n') + '\n'
  )
}
