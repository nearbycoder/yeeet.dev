// Rolling dynamic programming keeps wildcard matching bounded without regex backtracking.
type Token =
  | { kind: 'literal'; value: string }
  | { kind: 'one' | 'star' | 'globstar' | 'folders' }

export function compileUploadRules(input: string) {
  const patterns = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  if (patterns.length > 30 || patterns.some((pattern) => pattern.length > 200))
    throw new Error('Use at most 30 patterns, each at most 200 characters.')
  return patterns.map((pattern) => {
    const tokens: Array<Token> = []
    for (let index = 0; index < pattern.length; index++) {
      const character = pattern[index]
      if (character === '*' && pattern[index + 1] === '*') {
        index++
        if (pattern[index + 1] === '/') {
          tokens.push({ kind: 'folders' })
          index++
        } else tokens.push({ kind: 'globstar' })
      } else if (character === '*') tokens.push({ kind: 'star' })
      else if (character === '?') tokens.push({ kind: 'one' })
      else tokens.push({ kind: 'literal', value: character })
    }
    return (path: string) => {
      let previous = new Uint8Array(path.length + 1)
      previous[0] = 1
      for (const token of tokens) {
        const next = new Uint8Array(path.length + 1)
        if (token.kind === 'literal' || token.kind === 'one') {
          for (let index = 0; index < path.length; index++)
            next[index + 1] = Number(
              Boolean(previous[index]) &&
                (token.kind === 'literal'
                  ? path[index] === token.value
                  : path[index] !== '/'),
            )
        } else if (token.kind === 'folders') {
          let reachable = false
          for (let index = 0; index <= path.length; index++) {
            next[index] = Number(
              Boolean(previous[index]) ||
                (reachable && path[index - 1] === '/'),
            )
            reachable ||= Boolean(previous[index])
          }
        } else {
          next[0] = previous[0]
          for (let index = 0; index < path.length; index++)
            next[index + 1] = Number(
              Boolean(previous[index + 1]) ||
                (Boolean(next[index]) &&
                  (token.kind === 'globstar' || path[index] !== '/')),
            )
        }
        previous = next
      }
      return Boolean(previous[path.length])
    }
  })
}

export function matchingUploadPaths(paths: Array<string>, input: string) {
  const rules = compileUploadRules(input)
  return paths.filter((path) => rules.some((rule) => rule(path)))
}
