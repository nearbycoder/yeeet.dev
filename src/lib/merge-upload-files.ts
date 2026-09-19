export function mergeUploadFiles<T extends { path: string }>(
  existing: Array<T>,
  incoming: Array<T>,
): Array<T> {
  const byPath = new Map(existing.map((file) => [file.path, file]))
  for (const file of incoming) byPath.set(file.path, file)
  return [...byPath.values()]
}
