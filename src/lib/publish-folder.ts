type Entry = { path: string }
export function publishFolders(files: Array<Entry>) {
  return [
    ...new Set(
      files
        .filter((file) => file.path.endsWith('/index.html'))
        .map((file) => file.path.slice(0, -'/index.html'.length)),
    ),
  ].sort()
}
export function selectPublishFolder<T extends Entry>(
  files: Array<T>,
  folder: string,
): Array<T> {
  if (!folder) return files
  if (!publishFolders(files).includes(folder))
    throw new Error('Choose a folder containing index.html.')
  return files
    .filter((file) => file.path.startsWith(`${folder}/`))
    .map((file) => ({ ...file, path: file.path.slice(folder.length + 1) }))
}
