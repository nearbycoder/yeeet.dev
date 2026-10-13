import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ArrowIcon, Brand } from '#/components/brand'
import { NavigationMenu } from '#/components/navigation-menu'
import { PromoFilm } from '#/components/promo-film'
import { ThemeToggle } from '#/components/theme-toggle'
import { canonicalLink, socialMeta } from '#/lib/seo'
import {
  PROMO_DURATION,
  PROMO_FPS,
  PROMO_HEIGHT,
  PROMO_WIDTH,
  scenes,
} from '#/lib/promo-timeline'
import type { PromoScene } from '#/lib/promo-timeline'
import { getPublicPlatformConfig } from '#/server/functions'

declare global {
  interface Window {
    __promo?: {
      duration: number
      fps: number
      width: number
      height: number
      seek: (ms: number) => Promise<void>
    }
  }
}

export const Route = createFileRoute('/promo')({
  validateSearch: z.object({
    capture: z.coerce.boolean().optional(),
    t: z.coerce.number().min(0).max(PROMO_DURATION).optional(),
  }),
  loader: () => getPublicPlatformConfig(),
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            ...socialMeta({
              origin: loaderData.controlPlaneUrl,
              path: '/promo',
              title: 'Watch Yeeet fly — the 40-second Yeeetling promo',
              description:
                'A Yeeetling gobbles a build, flings it at the edge, and sticks the landing. See how Yeeet deploys a static site in one command.',
              image: '/og/promo.png',
              imageAlt:
                'Zip Blob the Yeeetling mid-yeeet, flinging a deployment parcel.',
            }),
            {
              property: 'og:video',
              content: new URL(
                '/promo/yeeet-promo.mp4',
                loaderData.controlPlaneUrl,
              ).href,
            },
            { property: 'og:video:type', content: 'video/mp4' },
            { property: 'og:video:width', content: String(PROMO_WIDTH) },
            { property: 'og:video:height', content: String(PROMO_HEIGHT) },
          ],
          links: [canonicalLink(loaderData.controlPlaneUrl, '/promo')],
        }
      : {},
  component: PromoPage,
})

const chapters: Array<{ scene: PromoScene; label: string }> = [
  { scene: 'intro', label: 'You built a thing' },
  { scene: 'terminal', label: 'One command' },
  { scene: 'gobble', label: 'Gobble' },
  { scene: 'yeeet', label: 'YEEET!' },
  { scene: 'touchdown', label: 'Touchdown' },
  { scene: 'rollback', label: 'Rollback' },
  { scene: 'agents', label: 'Agents' },
  { scene: 'finale', label: 'Finale' },
]

const POSTER_FRAME = 3200

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `0:${String(seconds).padStart(2, '0')}`
}

function PromoPage() {
  const { capture, t: initial } = Route.useSearch()
  if (capture) return <PromoCapture initial={initial ?? 0} />
  return <PromoPlayerPage initial={initial ?? 0} />
}

function PromoCapture({ initial }: { initial: number }) {
  const [t, setT] = useState(initial)

  useEffect(() => {
    document.documentElement.classList.add('promo-capture')
    document.body.classList.add('promo-capture')
    window.__promo = {
      duration: PROMO_DURATION,
      fps: PROMO_FPS,
      width: PROMO_WIDTH,
      height: PROMO_HEIGHT,
      seek: (ms) =>
        new Promise((resolve) => {
          flushSync(() => setT(ms))
          requestAnimationFrame(() => resolve())
        }),
    }
    return () => {
      delete window.__promo
    }
  }, [])

  return <PromoFilm t={t} />
}

function PromoPlayerPage({ initial }: { initial: number }) {
  const { docsUrl } = Route.useLoaderData()
  const [t, setT] = useState(initial)
  const [playing, setPlaying] = useState(false)
  const [sound, setSound] = useState(false)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [scale, setScale] = useState(0.5)
  const viewport = useRef<HTMLDivElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const time = useRef(t)
  time.current = t

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / PROMO_WIDTH),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (initial !== 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Without autoplay, rest on a composed frame instead of the empty first one.
    if (reduced.matches) setT(POSTER_FRAME)
    else setPlaying(true)
  }, [initial])

  useEffect(() => {
    const element = audio.current
    if (!element) return
    if (playing && sound) {
      element.currentTime = time.current / 1000
      void element.play().catch(() => setSound(false))
    } else {
      element.pause()
    }
  }, [playing, sound])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const startTime = time.current >= PROMO_DURATION ? 0 : time.current
    const startClock = performance.now()
    const tick = (now: number) => {
      const element = audio.current
      const next =
        sound && element && !element.paused
          ? element.currentTime * 1000
          : startTime + (now - startClock)
      if (next >= PROMO_DURATION) {
        setT(PROMO_DURATION)
        setPlaying(false)
        return
      }
      setT(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, sound])

  function seek(ms: number) {
    const next = Math.min(Math.max(ms, 0), PROMO_DURATION)
    setT(next)
    if (audio.current) audio.current.currentTime = next / 1000
    if (playing) {
      // Restart the clock from the new position.
      setPlaying(false)
      requestAnimationFrame(() => setPlaying(true))
    }
  }

  function toggle() {
    if (!playing && t >= PROMO_DURATION) setT(0)
    setPlaying((value) => !value)
  }

  const currentChapter = [...chapters]
    .reverse()
    .find((chapter) => t >= scenes[chapter.scene].start)?.scene

  return (
    <div className="marketing-shell promo-page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar wrap">
        <Brand />
        <NavigationMenu label="Promo navigation" className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/mascot">Yeeetlings</Link>
          <a href={docsUrl}>Docs</a>
          <ThemeToggle inline />
          <Link to="/dashboard" className="button button-small button-ink">
            Launch console <ArrowIcon />
          </Link>
        </NavigationMenu>
      </header>
      <main id="main-content" tabIndex={-1} className="wrap">
        <section className="promo-hero">
          <div className="eyebrow">
            <span className="status-dot" /> Now showing
          </div>
          <h1>
            Zip Blob <span>yeeets a website.</span>
          </h1>
          <p>
            Forty seconds, one command, and a very committed Yeeetling. This is
            the live, scrubbable version—every frame is drawn in your browser.
          </p>
        </section>

        <section className="promo-player" aria-label="Promo player">
          <div
            className="promo-viewport"
            ref={viewport}
            onClick={toggle}
            aria-hidden="true"
          >
            <div
              style={{ transform: `scale(${scale})` }}
              className="promo-scale"
            >
              <PromoFilm t={t} />
            </div>
            {!playing ? <span className="promo-big-play">▶</span> : null}
          </div>
          <div className="promo-controls">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'Pause promo' : 'Play promo'}
            >
              {playing
                ? '❚❚ Pause'
                : t >= PROMO_DURATION
                  ? '↺ Replay'
                  : '▶ Play'}
            </button>
            <input
              type="range"
              min={0}
              max={PROMO_DURATION}
              step={100}
              value={Math.round(t)}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Seek promo"
              aria-valuetext={`${formatTime(t)} of ${formatTime(PROMO_DURATION)}`}
            />
            <time>
              {formatTime(t)} / {formatTime(PROMO_DURATION)}
            </time>
            {audioAvailable ? (
              <button
                type="button"
                aria-pressed={sound}
                onClick={() => setSound((value) => !value)}
              >
                {sound ? '♪ Sound on' : '♪ Sound off'}
              </button>
            ) : null}
            <a href="/promo/yeeet-promo.mp4" download>
              MP4 ↓
            </a>
          </div>
          <audio
            ref={audio}
            src="/promo/yeeet-promo-audio.m4a"
            preload="none"
            onError={() => {
              setAudioAvailable(false)
              setSound(false)
            }}
          />
        </section>

        <ul className="promo-chapters" aria-label="Chapters">
          {chapters.map((chapter) => (
            <li key={chapter.scene}>
              <button
                type="button"
                aria-current={currentChapter === chapter.scene}
                onClick={() => seek(scenes[chapter.scene].start + 350)}
              >
                {chapter.label}
              </button>
            </li>
          ))}
        </ul>
        <details className="promo-transcript">
          <summary>Read the transcript</summary>
          <ol>
            <li>You built a thing. Now let’s get it on the internet.</li>
            <li>
              Step 01: one command—<code>yeeet deploy ./dist --name comet</code>
              —or drag a folder into the console.
            </li>
            <li>
              Step 02: Zip Blob the Yeeetling gobbles all 42 files, streaming
              them to private storage with checksums.
            </li>
            <li>
              YEEET! The build is flung to the edge, cached worldwide, and
              flipped live atomically.
            </li>
            <li>Step 03: live with HTTPS in about two seconds.</li>
            <li>
              Changed your mind? Every deploy is immutable; roll back in one
              click with zero downtime.
            </li>
            <li>
              Humans, CI, and agents: CLI, GitHub Action, MCP server, and a REST
              API with stable JSON.
            </li>
            <li>Build it. Yeeet it. yeeet.dev</li>
          </ol>
        </details>
      </main>
    </div>
  )
}
