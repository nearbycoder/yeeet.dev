import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Yeeetling, getYeeetlingDesign } from '#/components/yeeetling'

// Renders the static social cards in public/og at their exact pixel size.
// `npm run media:render` screenshots this route; it is not linked anywhere.
const assets = ['og-yeeet', 'og-yeeetlings', 'og-docs'] as const

export const Route = createFileRoute('/brand')({
  validateSearch: z.object({ asset: z.enum(assets).catch('og-yeeet') }),
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex' },
      { title: 'Yeeet brand cards' },
    ],
  }),
  component: BrandCard,
})

function Mark() {
  return (
    <div className="brand-card-mark">
      <span>Y!</span>
      yeeet
    </div>
  )
}

function BrandCard() {
  const { asset } = Route.useSearch()

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.classList.add('promo-capture')
    document.body.classList.add('promo-capture')
  }, [])

  if (asset === 'og-yeeetlings') {
    const crew = [
      'cosmic-pickle',
      'turbo-waffle',
      'comet',
      'docs',
      'spicy-meteor',
      'fuzzy-rocket',
    ]
    return (
      <div className="brand-card brand-card-crew">
        <div className="brand-card-copy">
          <Mark />
          <span className="brand-card-kicker">Yeeetling lab</span>
          <h1>
            Every site gets a tiny, <em>weird coworker.</em>
          </h1>
          <p>Your site name is the seed. 1.8 million possible pals.</p>
        </div>
        <ul>
          {crew.map((seed) => (
            <li key={seed}>
              <Yeeetling seed={seed} phase="idle" />
              <b>{getYeeetlingDesign(seed).name}</b>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (asset === 'og-docs') {
    return (
      <div className="brand-card brand-card-docs">
        <div className="brand-card-copy">
          <Mark />
          <span className="brand-card-kicker">CLI docs</span>
          <h1>
            Folder to HTTPS <em>in one command.</em>
          </h1>
          <pre>
            <code>
              <i>$</i> npm i -g @yeeet.dev/cli{'\n'}
              <i>$</i> yeeet deploy ./dist{'\n'}
              <b>✓ Live at https://comet.site.yeeet.dev</b>
            </code>
          </pre>
        </div>
        <div className="brand-card-docs-critter">
          <Yeeetling seed="docs" phase="idle" />
        </div>
      </div>
    )
  }

  return (
    <div className="brand-card brand-card-home">
      <div className="brand-card-copy">
        <Mark />
        <span className="brand-card-kicker">
          Static hosting, unreasonably fast
        </span>
        <h1>
          Build it.
          <br />
          <em>Yeeet it.</em>
        </h1>
        <div className="brand-card-command">
          <i>$</i> yeeet deploy ./dist
        </div>
      </div>
      <div className="brand-card-stage">
        <span className="brand-card-orbit" />
        <span className="brand-card-orbit brand-card-orbit-dashed" />
        <span className="brand-card-pad" />
        <span className="brand-card-parcel">⌑</span>
        <div className="brand-card-star">
          <Yeeetling seed="comet" phase="ready" />
        </div>
        <div className="brand-card-side brand-card-side-left">
          <Yeeetling seed="cosmic-pickle" phase="idle" />
        </div>
        <div className="brand-card-side brand-card-side-right">
          <Yeeetling seed="turbo-waffle" phase="idle" />
        </div>
        <div className="brand-card-live">
          <i>✓</i>
          <span>
            <b>comet.site.yeeet.dev</b>
            <small>live in 1.8s</small>
          </span>
        </div>
      </div>
    </div>
  )
}
