import { isAbsolute, posix, relative, resolve } from 'node:path'
import { expand } from 'brace-expansion'
import { fdir } from 'fdir'
import picomatch from 'picomatch'

// Keep expansion bounded and fail before scanning rather than silently dropping
// exclusions. Escapes and literal braces retain the previous ignore grammar.
function expandIgnore(pattern) {
  if (pattern.length > 10000) throw new Error('Ignore pattern is too long.')
  let depth = 0
  for (let index = 0; index < pattern.length; index++) {
    if (pattern[index] === '\\') index++
    else if (pattern[index] === '{') {
      if (++depth > 64) throw new Error('Ignore pattern is nested too deeply.')
    } else if (pattern[index] === '}') depth = Math.max(0, depth - 1)
  }
  let prefix = '\0yeeet'
  while (pattern.includes(prefix)) prefix += '_'
  const literals = []
  const protect = (value) => {
    const marker = `${prefix}${literals.length}\0`
    literals.push([marker, value])
    return marker
  }
  let escaped = pattern.replace(/\\./g, protect)
  let previous
  do {
    previous = escaped
    escaped = escaped.replace(/\{[^{}]*\}/g, (group) =>
      /,|\.\./.test(group) ? group : protect(group),
    )
  } while (escaped !== previous)
  // One input-length of headroom makes a truncated expansion exceed the
  // accepted character budget, so the library's cap cannot omit ignores.
  const patterns = expand(escaped, {
    max: 10001,
    maxLength: 4000000 + escaped.length,
  })
  if (
    patterns.length > 10000 ||
    patterns.reduce((total, value) => total + value.length, 0) > 4000000
  )
    throw new Error('Ignore pattern expands to too many paths.')
  return patterns.map((value) => {
    // Restore outer literal groups before the escaped characters inside them.
    for (const [marker, literal] of literals.toReversed())
      value = value.replaceAll(marker, literal)
    return value
  })
}

function affectsDirectories(pattern) {
  const name = posix.basename(pattern)
  return (
    pattern.endsWith('/**') ||
    !(
      name.includes('\\') ||
      /[*?]|^!|\[[^[]*]|(?:^|[^!*+?@])\([^(]*\|[^|]*\)|[!*+?@]\([^(]*\)/.test(
        name,
      ) ||
      /\{[^}]*[,]|\{[^}]*\.\./.test(name)
    )
  )
}

export async function scanDeploymentFiles(cwd, ignore) {
  const patterns = ignore
    .flatMap(expandIgnore)
    .filter(Boolean)
    .map((value) => {
      const normalized = value.replace(/(?!^)\/{2,}/g, '/')
      return normalized.startsWith('!') && normalized[1] !== '('
        ? normalized.slice(1)
        : normalized
    })
  const matchers = patterns.map((pattern) => ({
    absolute: isAbsolute(pattern),
    directory: affectsDirectories(pattern),
    regex: picomatch.makeRe(pattern, {
      dot: true,
      posix: true,
      strictSlashes: false,
    }),
  }))
  return new fdir({
    relativePaths: true,
    pathSeparator: '/',
    excludeSymlinks: true,
    suppressErrors: false,
    filters: [
      (path) =>
        !matchers.some(({ absolute, regex }) =>
          regex.test(
            absolute ? resolve(cwd, path).replaceAll('\\', '/') : path,
          ),
        ),
    ],
    exclude: (_, path) =>
      matchers.some(
        ({ directory, regex }) =>
          directory && regex.test(relative(cwd, path).replaceAll('\\', '/')),
      ),
  })
    .crawl(cwd)
    .withPromise()
}
