import { CopyButton } from '#/components/copy-button'
import { NavigationMenu } from '#/components/navigation-menu'
import { ThemeToggle } from '#/components/theme-toggle'
import { Yeeetling, getYeeetlingDesign } from '#/components/yeeetling'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowIcon, Brand, GitHubIcon } from '#/components/brand'
import { getPublicPlatformConfig, getSession } from '#/server/functions'
import { canonicalLink, socialMeta } from '#/lib/seo'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/dashboard' })
  },
  loader: () => getPublicPlatformConfig(),
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: socialMeta({
            origin: loaderData.controlPlaneUrl,
            path: '/',
            title: 'Yeeet — static sites at terminal velocity',
            description:
              'Yeeet a folder to a live HTTPS URL in one command. Atomic deploys, instant rollbacks, and a tiny Yeeetling for every site.',
            image: '/og/yeeet.png',
            imageAlt:
              'Build it. Yeeet it. A crew of Yeeetlings launching a static site.',
          }),
          links: [canonicalLink(loaderData.controlPlaneUrl, '/')],
        }
      : {},
  component: Home,
})

const command = 'yeeet deploy ./dist --name comet'
const repositoryUrl = 'https://github.com/nearbycoder/yeeet.dev'
const crew = [
  'comet',
  'cosmic-pickle',
  'turbo-waffle',
  'docs',
  'spicy-meteor',
  'fuzzy-rocket',
]

function Home() {
  const { docsUrl, siteDomain } = Route.useLoaderData()

  return (
    <div className="marketing-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar wrap">
        <Brand />
        <NavigationMenu label="Main navigation" className="nav-links">
          <a href="#watch">Watch it fly</a>
          <a href="#how">How it works</a>
          <Link to="/mascot">Yeeetlings</Link>
          <a href={docsUrl}>Docs</a>
          <ThemeToggle inline />
          <Link to="/dashboard" className="button button-small button-ink">
            Launch console <ArrowIcon />
          </Link>
        </NavigationMenu>
      </header>

      <main id="main-content" tabIndex={-1}>
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
              pipelines. No configuration archaeology. Just a tiny coworker who
              throws your build at the edge.
            </p>
            <div className="hero-actions">
              <Link to="/dashboard" className="button button-coral">
                Start yeeeting <ArrowIcon />
              </Link>
              <a href="#watch" className="hero-watch">
                <span aria-hidden="true">▶</span> Watch the 40-second flight
              </a>
            </div>
            <div className="hero-command">
              <span aria-hidden="true">$</span>
              <code>npm i -g @yeeet.dev/cli</code>
              <CopyButton
                value="npm i -g @yeeet.dev/cli"
                label="Copy"
                ariaLabel="Copy install command"
              />
            </div>
          </div>

          <div
            className="launch-stage"
            role="img"
            aria-label="A Yeeetling flinging a deployment parcel into orbit"
          >
            <div className="launch-orbit launch-orbit-one" />
            <div className="launch-orbit launch-orbit-two" />
            <span className="launch-parcel" aria-hidden="true">
              ⌑
            </span>
            <div className="launch-pad" />
            <div className="launch-hero-critter">
              <Yeeetling seed="comet" phase="ready" />
            </div>
            <div className="launch-sidekick launch-sidekick-left">
              <Yeeetling seed="cosmic-pickle" phase="idle" />
            </div>
            <div className="launch-sidekick launch-sidekick-right">
              <Yeeetling seed="turbo-waffle" phase="idle" />
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

        <section className="proof-strip" aria-label="Platform features">
          <div className="proof-marquee">
            {[0, 1].map((copy) => (
              <div
                className="proof-grid"
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
              >
                <span>WILDCARD SSL</span>
                <i />
                <span>GLOBAL CDN</span>
                <i />
                <span>ATOMIC DEPLOYS</span>
                <i />
                <span>ONE-CLICK ROLLBACK</span>
                <i />
                <span>PRIVATE SHARE LINKS</span>
                <i />
                <span>BUILT FOR AGENTS</span>
                <i />
              </div>
            ))}
          </div>
        </section>

        <section className="watch-section wrap" id="watch">
          <div className="section-kicker">01 / WATCH IT FLY</div>
          <div className="watch-layout">
            <div className="watch-copy">
              <h2>
                Forty seconds.
                <br />
                One very fast
                <br />
                <span>coworker.</span>
              </h2>
              <p>
                Meet the Yeeetlings. Every site gets one, generated from its
                name. They gobble your files, fling them at the edge, and stick
                the landing—every single deploy.
              </p>
              <Link to="/promo" className="text-link">
                Open the interactive version <ArrowIcon />
              </Link>
            </div>
            <figure className="promo-frame">
              <video
                controls
                playsInline
                preload="none"
                poster="/promo/yeeet-promo-poster.jpg"
                aria-label="Yeeet promo: a Yeeetling deploys a static site"
              >
                <source src="/promo/yeeet-promo.mp4" type="video/mp4" />
              </video>
              <figcaption>
                <span className="status-dot" /> yeeet-promo.mp4 · 0:40 · sound
                on for full chaos
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="terminal-section wrap" id="terminal">
          <div className="section-kicker">02 / SHIP FROM ANYWHERE</div>
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
              <CopyButton
                value={command}
                label="Copy command"
                className="copy-command"
              />
            </div>
          </div>
        </section>

        <section className="how-section" id="how">
          <div className="wrap">
            <div className="section-kicker">03 / THE WHOLE FLIGHT PLAN</div>
            <div className="feature-grid">
              <article>
                <span className="feature-number">01</span>
                <div className="feature-critter">
                  <Yeeetling seed="drop-anything" phase="ready" />
                </div>
                <h3>Drop anything</h3>
                <p>
                  A folder, a file, a build directory. Browser, CLI, CI, or an
                  agent—the manifest is the same.
                </p>
              </article>
              <article>
                <span className="feature-number">02</span>
                <div className="feature-critter">
                  <Yeeetling seed="upload-direct" phase="uploading" />
                </div>
                <h3>Gobble it up</h3>
                <p>
                  Short-lived signed URLs stream every byte straight to private
                  object storage, checksummed on the way in.
                </p>
              </article>
              <article>
                <span className="feature-number">03</span>
                <div className="feature-critter">
                  <Yeeetling seed="land-everywhere" phase="idle" />
                </div>
                <h3>Stick the landing</h3>
                <p>
                  Wildcard TLS, clean URLs, ETags, range requests, and edge
                  caching by default. Roll back in one click.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="crew-section wrap" aria-labelledby="crew-heading">
          <div className="crew-copy">
            <div className="section-kicker">04 / MEET THE CREW</div>
            <h2 id="crew-heading">Every site gets a tiny, weird coworker.</h2>
            <p>
              Your site name is the seed. Same slug, same pal—1.8 million
              possible Yeeetlings, rendered as crisp SVG with zero image
              generation.
            </p>
            <Link to="/mascot" className="button button-paper">
              Generate yours <ArrowIcon />
            </Link>
          </div>
          <ul className="crew-lineup">
            {crew.map((slug, index) => (
              <li
                key={slug}
                style={{ '--crew-index': index } as React.CSSProperties}
              >
                <Yeeetling seed={slug} phase="idle" />
                <b>{getYeeetlingDesign(slug).name}</b>
                <code>
                  {slug}.{siteDomain}
                </code>
              </li>
            ))}
          </ul>
        </section>

        <section className="agent-section wrap">
          <div className="agent-card">
            <div>
              <div className="section-kicker light">05 / ROBOTS WELCOME</div>
              <h2>An API your agents can actually use.</h2>
              <p>
                Stable JSON, predictable exit codes, API keys for unattended
                runs, an MCP server, and an OpenAPI contract. If it can make a
                folder, it can yeeet it.
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
          <div className="final-crew" aria-hidden="true">
            <Yeeetling seed="folder-called" phase="ready" />
            <Yeeetling seed="wants-to-fly" phase="ready" />
            <Yeeetling seed="yeeet-it" phase="ready" />
          </div>
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
        <div className="footer-brand">
          <Brand />
          <p>Static sites at terminal velocity.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a href={docsUrl}>Docs</a>
          <a href={`${docsUrl}/llms.txt`}>For agents</a>
          <Link to="/mascot">Yeeetling lab</Link>
          <Link to="/promo">Promo</Link>
          <a href={repositoryUrl}>
            <GitHubIcon /> GitHub
          </a>
        </nav>
        <span>MIT licensed · © {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
