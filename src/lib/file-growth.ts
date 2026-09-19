type Entry = { path: string; size: number }
export function fileGrowth(next: Array<Entry>, previous: Array<Entry>) {
  const before = new Map(previous.map((file) => [file.path, file.size]))
  const after = new Map(next.map((file) => [file.path, file.size]))
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .map((path) => {
      const old = before.get(path) ?? 0,
        current = after.get(path) ?? 0
      return {
        path,
        before: old,
        after: current,
        delta: current - old,
        kind: !before.has(path)
          ? 'added'
          : !after.has(path)
            ? 'removed'
            : 'changed',
      }
    })
    .filter((file) => file.delta !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) || a.path.localeCompare(b.path),
    )
  const beforeBytes = previous.reduce((sum, file) => sum + file.size, 0)
  const afterBytes = next.reduce((sum, file) => sum + file.size, 0)
  return { beforeBytes, afterBytes, delta: afterBytes - beforeBytes, changes }
}
export type FileGrowthReport = ReturnType<typeof fileGrowth>
