export function sourceMatches(text: string, query: string) {
  if (!query) return []
  const matches: Array<{ start: number; end: number; line: number }> = []
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'giu',
  )
  let line = 1,
    counted = 0
  while (matches.length < 1000) {
    const match = pattern.exec(text)
    if (!match) break
    const start = match.index
    for (let index = counted; index < start; index++)
      if (text[index] === '\n') line++
    counted = start
    matches.push({ start, end: start + match[0].length, line })
  }
  return matches
}

export function formatJsonSource(text: string, truncated: boolean) {
  if (truncated)
    throw new Error('Download the complete file to format truncated JSON.')
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    throw new Error(
      'This source is not valid JSON. The original text is still available.',
    )
  }
}
