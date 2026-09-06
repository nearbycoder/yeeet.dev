import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function NavigationMenu({
  children,
  label,
  className = '',
}: {
  children: ReactNode
  label: string
  className?: string
}) {
  const id = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="navigation-toggle"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? 'Close' : 'Open'} ${label.toLowerCase()}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        {open ? 'Close' : 'Menu'}{' '}
        <span aria-hidden="true">{open ? '×' : '+'}</span>
      </button>
      <nav
        id={id}
        className={`responsive-navigation ${open ? 'is-open' : ''} ${className}`}
        aria-label={label}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a')) {
            setOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            setOpen(false)
            toggle.current?.focus()
          }
        }}
      >
        {children}
      </nav>
    </>
  )
}
