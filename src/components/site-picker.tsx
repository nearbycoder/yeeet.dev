import { useEffect, useId, useState } from 'react'
import { getSiteSearchPage } from '#/server/functions'

export function SitePicker() {
  const id = useId()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Array<string>>([])
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      void getSiteSearchPage({ data: { q: query.slice(0, 200) } })
        .then((result) => {
          if (active) setSuggestions(result.sites.map((site) => site.slug))
        })
        .catch(() => {
          if (active) setSuggestions([])
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])
  return (
    <label>
      Your site
      <input
        required
        name="slug"
        list={id}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your sites…"
        autoComplete="off"
        maxLength={63}
      />
      <datalist id={id}>
        {suggestions.map((slug) => (
          <option key={slug} value={slug} />
        ))}
      </datalist>
    </label>
  )
}
