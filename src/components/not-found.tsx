import { Link } from '@tanstack/react-router'
import { Brand } from './brand'
import { ThemeToggle } from './theme-toggle'
import { Yeeetling } from './yeeetling'

function LostPage({
  code,
  title,
  detail,
  seed,
  children,
}: {
  code: string
  title: string
  detail: string
  seed: string
  children?: React.ReactNode
}) {
  return (
    <main id="main-content" tabIndex={-1} className="auth-page lost-page">
      <div className="auth-top">
        <Brand />
        <ThemeToggle inline />
      </div>
      <section className="lost-card">
        <div className="lost-critter">
          <Yeeetling seed={seed} phase="error" />
          <span className="lost-question" aria-hidden="true">
            ?
          </span>
        </div>
        <div className="eyebrow">
          <span className="status-dot" /> {code}
        </div>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="lost-actions">
          {children}
          <Link to="/" className="button button-paper">
            Back to earth
          </Link>
        </div>
      </section>
    </main>
  )
}

export function NotFoundPage() {
  return (
    <LostPage
      code="404 / Off course"
      title="Nothing landed here."
      detail="This Yeeetling flung the page somewhere past the edge. Check the address, or head back to the launchpad."
      seed="lost-in-orbit"
    >
      <Link to="/dashboard" className="button button-coral">
        Open the launchpad
      </Link>
    </LostPage>
  )
}

export function ErrorPage({ reset }: { reset?: () => void }) {
  return (
    <LostPage
      code="Turbulence"
      title="Something wobbled."
      detail="The request hit unexpected turbulence. Try again in a moment; your deployments are safe."
      seed="turbulence"
    >
      <button
        type="button"
        className="button button-coral"
        onClick={() => (reset ? reset() : window.location.reload())}
      >
        Try again
      </button>
    </LostPage>
  )
}
