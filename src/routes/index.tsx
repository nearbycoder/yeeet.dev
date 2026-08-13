import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowIcon, Brand } from '#/components/brand'
import { getPublicPlatformConfig, getSession } from '#/server/functions'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/dashboard' })
  },
  loader: () => getPublicPlatformConfig(),
  component: Home,
})

const command = 'yeeet deploy ./dist --name comet'

function Home() {
  const { docsUrl, siteDomain } = Route.useLoaderData()

  return (
    <div className="marketing-shell">
      <header className="topbar wrap">
        <Brand />
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#how">How it works</a>
          <Link to="/mascot">Yeeetlings</Link>
          <a href={docsUrl}>Docs</a>
          <a href={`${docsUrl}/llms.txt`}>For agents</a>
          <Link to="/dashboard" className="button button-small button-ink">
            Launch console <ArrowIcon />
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> Static hosting, unreasonably fast
            </div>
            <h1>
              Build it.
              <br />
              <span>Yeeet it.</span>
            </h1>
            <p className="hero-lede">
              From a folder to a global, SSL-secured site in one command. No
              pipelines. No configuration archaeology. Just terminal velocity.
            </p>
            <div className="hero-actions">
              <Link to="/dashboard" className="button button-coral">
                Start yeeeting <ArrowIcon />
              </Link>
              <a href="#terminal" className="text-link">
                See the CLI <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <div
            className="orbit-stage"
            aria-label="A deployment flying to the edge"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="planet">
              <span>Y!</span>
            </div>
            <div className="flight-card flight-card-one">
              <span className="flight-icon">↗</span>
              <span>
                <b>42 files</b>
                <small>in flight</small>
              </span>
            </div>
            <div className="flight-card flight-card-two">
              <span className="flight-check">✓</span>
              <span>
                <b>comet.{siteDomain}</b>
                <small>live in 1.8s</small>
              </span>
            </div>
            <span className="spark spark-one">✦</span>
            <span className="spark spark-two">+</span>
            <span className="spark spark-three">✦</span>
          </div>
        </section>

        <section className="proof-strip">
          <div className="wrap proof-grid">
            <span>WILDCARD SSL</span>
            <i />
            <span>GLOBAL CDN</span>
            <i />
            <span>ATOMIC DEPLOYS</span>
            <i />
            <span>BUILT FOR AGENTS</span>
          </div>
        </section>

        <section className="terminal-section wrap" id="terminal">
          <div className="section-kicker">01 / SHIP FROM ANYWHERE</div>
          <div className="terminal-layout">
            <div>
              <h2>
                One command.
                <br />
                Zero ceremony.
              </h2>
              <p>
                Login once, point at any folder, and get a permanent URL. Every
                upload is immutable until the full deployment is ready to flip
                live.
              </p>
            </div>
            <div className="terminal-window">
              <div className="terminal-titlebar">
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <b>~/projects/comet</b>
                <em>⌘</em>
              </div>
              <div className="terminal-body">
                <p>
                  <span className="prompt">$</span> npm run build
                </p>
                <p className="terminal-muted">✓ built 42 files in 812ms</p>
                <p className="terminal-command">
                  <span className="prompt">$</span> {command}
                </p>
                <div className="terminal-progress">
                  <span />
                </div>
                <p className="terminal-muted">Uploaded 42 / 42 · 2.4 MB</p>
                <p className="terminal-success">
                  ✓ Live at <b>https://comet.{siteDomain}</b>
                </p>
              </div>
              <button
                className="copy-command"
                onClick={() => navigator.clipboard.writeText(command)}
                type="button"
              >
                Copy command
              </button>
            </div>
          </div>
        </section>

        <section className="how-section" id="how">
          <div className="wrap">
            <div className="section-kicker">02 / THE WHOLE FLIGHT PLAN</div>
            <div className="feature-grid">
              <article>
                <span className="feature-number">01</span>
                <div className="feature-glyph">⌁</div>
                <h3>Drop anything</h3>
                <p>
                  A folder, a file, a build directory. Browser or CLI—the
                  manifest is the same.
                </p>
              </article>
              <article>
                <span className="feature-number">02</span>
                <div className="feature-glyph">◇</div>
                <h3>Upload direct</h3>
                <p>
                  Short-lived signed URLs move bytes straight to private object
                  storage.
                </p>
              </article>
              <article>
                <span className="feature-number">03</span>
                <div className="feature-glyph">◎</div>
                <h3>Land everywhere</h3>
                <p>
                  Wildcard TLS, clean URLs, ETags, range requests, and edge
                  caching by default.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="agent-section wrap">
          <div className="agent-card">
            <div>
              <div className="section-kicker light">03 / ROBOTS WELCOME</div>
              <h2>An API your agents can actually use.</h2>
              <p>
                Stable JSON, predictable exit codes, API keys for unattended
                runs, and an OpenAPI contract. If it can make a folder, it can
                yeeet it.
              </p>
              <a href={`${docsUrl}/llms.txt`} className="button button-paper">
                Read the agent guide <ArrowIcon />
              </a>
            </div>
            <pre aria-label="Agent deployment example">
              <code>{`$ YEEET_TOKEN=yeeet_••• \\\n  yeeet deploy ./out \\\n  --name docs --json

{
  "status": "ready",
  "url": "https://docs.${siteDomain}",
  "deployment": "dpl_…"
}`}</code>
            </pre>
          </div>
        </section>

        <section className="final-cta wrap">
          <span className="spark">✦</span>
          <h2>
            Your folder called.
            <br />
            It wants to fly.
          </h2>
          <Link to="/dashboard" className="button button-coral">
            Open the launchpad <ArrowIcon />
          </Link>
        </section>
      </main>

      <footer className="footer wrap">
        <Brand />
        <p>Static sites at terminal velocity.</p>
        <span>Built on Railway · © {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
