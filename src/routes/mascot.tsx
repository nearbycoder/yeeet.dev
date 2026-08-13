import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Brand } from '#/components/brand'
import { Yeeetling, getYeeetlingDesign } from '#/components/yeeetling'
import type { YeeetlingPhase } from '#/components/yeeetling'
import { getPublicPlatformConfig } from '#/server/functions'

export const Route = createFileRoute('/mascot')({
  head: () => ({
    meta: [
      { title: 'Yeeetling Lab — Generate Your Site Mascot' },
      {
        name: 'description',
        content:
          'Enter a site name to generate its one-of-a-kind Yeeetling mascot and preview the deployment animations.',
      },
    ],
  }),
  loader: () => getPublicPlatformConfig(),
  component: MascotLab,
})

const randomFirst = [
  'cosmic',
  'tiny',
  'spicy',
  'wobbly',
  'turbo',
  'fuzzy',
  'sneaky',
  'electric',
]
const randomSecond = [
  'pickle',
  'comet',
  'waffle',
  'meteor',
  'bean',
  'rocket',
  'noodle',
  'goblin',
]

const phases: Array<{ value: YeeetlingPhase; label: string }> = [
  { value: 'ready', label: 'Ready' },
  { value: 'uploading', label: 'Gobble Files' },
  { value: 'finalizing', label: 'Yeeet!' },
  { value: 'done', label: 'Touchdown' },
]

function randomSlug() {
  const first = randomFirst[Math.floor(Math.random() * randomFirst.length)]
  const second = randomSecond[Math.floor(Math.random() * randomSecond.length)]
  return `${first}-${second}-${Math.random().toString(16).slice(2, 6)}`
}

function MascotLab() {
  const { docsUrl, siteDomain } = Route.useLoaderData()
  const [slug, setSlug] = useState('cosmic-pickle')
  const [phase, setPhase] = useState<YeeetlingPhase>('ready')
  const [replay, setReplay] = useState(0)
  const design = getYeeetlingDesign(slug || 'random-site')

  function play(nextPhase: YeeetlingPhase) {
    setPhase(nextPhase)
    setReplay((value) => value + 1)
  }

  return (
    <div className="mascot-lab-shell">
      <header className="topbar wrap mascot-lab-header">
        <Brand />
        <nav aria-label="Mascot lab navigation">
          <a href={docsUrl}>Docs</a>
          <Link to="/dashboard" className="button button-small button-ink">
            Launch console ↗
          </Link>
        </nav>
      </header>

      <main className="mascot-lab-main">
        <section className="mascot-lab-copy">
          <div className="eyebrow">
            <span className="status-dot" /> Yeeetling Lab
          </div>
          <h1>
            Every site gets a tiny, weird <span>coworker.</span>
          </h1>
          <p>
            A site name deterministically mixes the body, palette, face,
            antennae, markings, feet, attitude, and name. Same slug, same pal.
            More than 1.8 million visual combinations.
          </p>

          <label className="mascot-slug-label" htmlFor="mascot-slug">
            Site Name
          </label>
          <div className="mascot-slug-control">
            <input
              id="mascot-slug"
              name="mascot-slug"
              value={slug}
              onChange={(event) => {
                setSlug(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                )
                setPhase('ready')
              }}
              placeholder="cosmic-pickle…"
              autoComplete="off"
              spellCheck={false}
            />
            <b>.{siteDomain}</b>
            <button
              type="button"
              onClick={() => {
                setSlug(randomSlug())
                play('ready')
              }}
            >
              Surprise me
            </button>
          </div>
        </section>

        <section className="mascot-generator" aria-labelledby="mascot-name">
          <div className="mascot-generator-grid" aria-hidden="true" />
          <div className="mascot-orbit mascot-orbit-one" aria-hidden="true" />
          <div className="mascot-orbit mascot-orbit-two" aria-hidden="true" />
          <Yeeetling
            key={`${slug}-${phase}-${replay}`}
            seed={slug || 'random-site'}
            phase={phase}
            label={`${design.name}, the Yeeetling generated for ${slug || 'this site'}`}
          />
          <div className="mascot-identity">
            <span>Your Yeeetling</span>
            <h2 id="mascot-name">{design.name}</h2>
            <code>
              {slug || 'random-site'}.{siteDomain}
            </code>
          </div>
          <div className="mascot-phase-controls" aria-label="Preview animation">
            {phases.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={phase === item.value}
                onClick={() => play(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      </main>

      <section className="mascot-lab-note wrap">
        <span>HOW IT WORKS</span>
        <p>
          Nothing extra is stored and no image generation is required. The slug
          is the seed, so the browser and dashboard can reconstruct the exact
          same SVG character instantly—crisp at any size and ready to animate
          through every deploy.
        </p>
        <Link to="/dashboard" className="button button-coral">
          Give a Yeeetling a site ↗
        </Link>
      </section>
    </div>
  )
}
