import { useEffect, useState } from 'react'
import {
  applyReadingPreferences,
  defaultReadingPreferences,
  parseReadingPreferences,
  readingPreferencesKey,
} from '#/lib/reading-preferences'

export function ApplyReadingPreferences() {
  useEffect(() => {
    function update() {
      try {
        applyReadingPreferences(
          parseReadingPreferences(localStorage.getItem(readingPreferencesKey)),
        )
      } catch {
        applyReadingPreferences(defaultReadingPreferences)
      }
    }
    update()
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  return null
}
export function ReadingPreferences() {
  const [value, setValue] = useState(defaultReadingPreferences),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  useEffect(() => {
    function read() {
      try {
        setValue(
          parseReadingPreferences(localStorage.getItem(readingPreferencesKey)),
        )
      } catch {
        setError(
          'Browser storage is unavailable. Changes apply for this page only.',
        )
      }
      setLoaded(true)
    }
    read()
    window.addEventListener('storage', read)
    return () => window.removeEventListener('storage', read)
  }, [])
  function save(next: typeof value, reset = false) {
    setValue(next)
    applyReadingPreferences(next)
    setError('')
    setNotice('')
    try {
      if (reset) localStorage.removeItem(readingPreferencesKey)
      else localStorage.setItem(readingPreferencesKey, JSON.stringify(next))
      setNotice(
        reset
          ? 'Reading preferences reset.'
          : 'Reading preferences saved for this browser.',
      )
    } catch {
      setError(
        'Browser storage is unavailable. Changes apply for this page only.',
      )
    }
  }
  return (
    <section className="panel site-page-panel" id="reading">
      <h2>Reading preferences</h2>
      <p>
        Use larger console text or reduce animation throughout the app.
        Preferences stay in this browser. Your system's reduced-motion setting
        still applies.
      </p>
      <div className="site-page-stack">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.largeText}
            disabled={!loaded}
            onChange={(event) =>
              save({ ...value, largeText: event.target.checked })
            }
          />
          Larger console text
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.reduceMotion}
            disabled={!loaded}
            onChange={(event) =>
              save({ ...value, reduceMotion: event.target.checked })
            }
          />
          Reduce animation
        </label>
        <button
          type="button"
          className="button button-paper"
          disabled={!loaded}
          onClick={() => save(defaultReadingPreferences, true)}
        >
          Reset reading preferences
        </button>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  )
}
