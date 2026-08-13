import { useEffect } from 'react'

const THEME_STORAGE_KEY = 'yeeet-theme'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#171714' : '#f5f1e8')
}

export function ThemeToggle() {
  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const followSystemTheme = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return
      } catch {
        // Theme switching should still work when storage is unavailable.
      }
      applyTheme(event.matches ? 'dark' : 'light')
    }

    colorScheme.addEventListener('change', followSystemTheme)
    return () => colorScheme.removeEventListener('change', followSystemTheme)
  }, [])

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => {
        const nextTheme =
          document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
        applyTheme(nextTheme)
        try {
          localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
        } catch {
          // Keep the in-page preference even when storage is unavailable.
        }
      }}
    >
      <svg
        className="theme-icon theme-icon-moon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" />
      </svg>
      <svg
        className="theme-icon theme-icon-sun"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
  )
}
