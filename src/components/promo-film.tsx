import { useId, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { YeeetlingArtwork, getYeeetlingDesign } from '#/components/yeeetling'
import {
  PROMO_AGENT,
  PROMO_COMMAND,
  PROMO_DURATION,
  PROMO_STAR,
  finaleCrewStart,
  gobble,
  liveStamp,
  promoFiles,
  rollbackClick,
  rollbackHop,
  scenes,
  touchdownMoment,
  typing,
  yeeetMoment,
} from '#/lib/promo-timeline'
import type { PromoScene } from '#/lib/promo-timeline'

// Every frame is a pure function of `t` (milliseconds). Nothing here reads the
// clock or relies on CSS animations, so a frame can be rendered at any time
// and look identical in the live player and the exported video.

const SITE_HOST = 'comet.site.yeeet.dev'

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))
const range = (t: number, start: number, end: number) =>
  clamp((t - start) / (end - start))
const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3
const easeInCubic = (p: number) => p ** 3
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
const easeOutBack = (p: number) => {
  if (p <= 0) return 0
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}
const wave = (t: number, period: number, amplitude: number, phase = 0) =>
  Math.sin((t / period) * Math.PI * 2 + phase) * amplitude
const pulse = (t: number, at: number, length: number) =>
  t < at || t > at + length ? 0 : Math.sin(((t - at) / length) * Math.PI)

function sceneFade(t: number, scene: PromoScene) {
  const { start, end } = scenes[scene]
  const fadeIn = start === 0 ? 1 : range(t, start, start + 320)
  const fadeOut = end === PROMO_DURATION ? 1 : 1 - range(t, end - 320, end)
  return Math.min(fadeIn, fadeOut)
}

function active(t: number, scene: PromoScene) {
  return t >= scenes[scene].start && t <= scenes[scene].end
}

function Critter({
  seed,
  x,
  y,
  size,
  rotate = 0,
  sx = 1,
  sy = 1,
  opacity = 1,
  z = 4,
  sticker = false,
}: {
  seed: string
  x: number
  y: number
  size: number
  rotate?: number
  sx?: number
  sy?: number
  opacity?: number
  z?: number
  sticker?: boolean
}) {
  const design = useMemo(() => getYeeetlingDesign(seed), [seed])
  const clipId = `promo-${useId().replaceAll(':', '')}`
  return (
    <div
      className={`promo-critter ${sticker ? 'is-sticker' : ''}`}
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        opacity,
        zIndex: z,
        transform: `translate(-50%, -100%) rotate(${rotate}deg) scale(${sx}, ${sy})`,
      }}
    >
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <YeeetlingArtwork design={design} clipId={clipId} />
      </svg>
    </div>
  )
}

function Caption({
  t,
  at,
  kicker,
  title,
  sub,
  className = '',
  style,
}: {
  t: number
  at: number
  kicker?: string
  title: ReactNode
  sub?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const enter = easeOutCubic(range(t, at, at + 520))
  const subEnter = easeOutCubic(range(t, at + 220, at + 740))
  return (
    <div className={`promo-caption ${className}`} style={style}>
      {kicker ? (
        <span
          className="promo-kicker"
          style={{
            opacity: enter,
            transform: `translateY(${(1 - enter) * 16}px)`,
          }}
        >
          {kicker}
        </span>
      ) : null}
      <h2
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 34}px)`,
        }}
      >
        {title}
      </h2>
      {sub ? (
        <p
          style={{
            opacity: subEnter,
            transform: `translateY(${(1 - subEnter) * 20}px)`,
          }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  )
}

function Folder({
  x,
  y,
  scale = 1,
  rotate = -4,
  bulge = 0,
}: {
  x: number
  y: number
  scale?: number
  rotate?: number
  bulge?: number
}) {
  return (
    <div
      className="promo-folder"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale * (1 + bulge * 0.06)}, ${scale * (1 - bulge * 0.04)})`,
      }}
    >
      <span className="promo-folder-tab" />
      <div className="promo-folder-body">
        <b>dist/</b>
        <small>42 files · 2.4 MB</small>
      </div>
    </div>
  )
}

function Sparks({
  t,
  at,
  x,
  y,
  count = 8,
  radius = 140,
  color = '#d9ee55',
}: {
  t: number
  at: number
  x: number
  y: number
  count?: number
  radius?: number
  color?: string
}) {
  const p = range(t, at, at + 700)
  if (p <= 0 || p >= 1) return null
  return (
    <div className="promo-sparks" style={{ left: x, top: y }}>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + 0.4
        const distance = easeOutCubic(p) * radius
        return (
          <span
            key={index}
            style={{
              color: index % 2 ? '#f04d2f' : color,
              opacity: 1 - p,
              transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(${p * 180}deg) scale(${1.4 - p})`,
            }}
          >
            ✦
          </span>
        )
      })}
    </div>
  )
}

function Intro({ t }: { t: number }) {
  const drop = easeOutBack(range(t, 250, 1000))
  const words = ['You', 'built', 'a', 'thing.']
  const peek = easeOutBack(range(t, 2100, 2700))
  const peekLeft = easeOutBack(range(t, 2500, 3100))
  const peekRight = easeOutBack(range(t, 2800, 3400))
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'intro') }}>
      <div className="promo-intro-title">
        <span className="promo-kicker">Yeeet presents</span>
        <h1>
          {words.map((word, index) => {
            const pop = easeOutBack(
              range(t, 600 + index * 170, 1050 + index * 170),
            )
            return (
              <span
                key={word}
                style={{
                  opacity: clamp(pop * 2),
                  transform: `translateY(${(1 - pop) * 60}px) scale(${0.7 + pop * 0.3})`,
                }}
              >
                {word}
              </span>
            )
          })}
        </h1>
        <p style={{ opacity: easeOutCubic(range(t, 1700, 2300)) }}>
          Now let’s get it on the internet.
        </p>
      </div>
      <Folder
        x={960}
        y={lerp(-260, 690, drop)}
        rotate={-4 + wave(t, 2400, 2)}
      />
      <Critter
        seed={PROMO_STAR}
        x={1560}
        y={lerp(1400, 1110, peek)}
        size={420}
        rotate={-14 + wave(t, 1600, 3)}
      />
      <Critter
        seed="cosmic-pickle"
        x={330}
        y={lerp(1360, 1120, peekLeft)}
        size={330}
        rotate={16 + wave(t, 1800, 4)}
      />
      <Critter
        seed="turbo-waffle"
        x={1880}
        y={lerp(620, 600, peekRight)}
        size={260}
        rotate={-62}
        opacity={peekRight}
      />
    </div>
  )
}

function Terminal({ t }: { t: number }) {
  const enter = easeOutCubic(range(t, 4200, 4750))
  const exit = easeInCubic(range(t, 8750, 9200))
  const typed = Math.floor(
    range(t, typing.start, typing.end) * PROMO_COMMAND.length,
  )
  const entered = t >= typing.end + 260
  const cursorOn = Math.floor(t / 420) % 2 === 0
  const progress = easeInOut(range(t, 7900, 9000))
  const hop = pulse(t, typing.end + 260, 460)
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'terminal') }}>
      <div
        className="promo-terminal"
        style={{
          transform: `translate(${-exit * 260}px, ${(1 - enter) * 120}px) rotate(-1deg)`,
          opacity: enter * (1 - exit),
        }}
      >
        <div className="promo-terminal-bar">
          <span>
            <i />
            <i />
            <i />
          </span>
          <b>~/projects/comet</b>
          <em />
        </div>
        <div className="promo-terminal-body">
          <p>
            <span className="promo-prompt">$</span> npm run build
          </p>
          <p className="promo-muted">✓ built 42 files in 812ms</p>
          <p className="promo-command">
            <span className="promo-prompt">$</span>{' '}
            {PROMO_COMMAND.slice(0, typed)}
            {!entered && cursorOn ? <i className="promo-cursor" /> : null}
          </p>
          {t >= 7150 ? (
            <p className="promo-muted">◇ Preparing 42 files · 2.4 MB</p>
          ) : null}
          {t >= 7650 ? (
            <p className="promo-coral">
              ↑ Feeding {getYeeetlingDesign(PROMO_STAR).name}…
            </p>
          ) : null}
          {t >= 7900 ? (
            <div className="promo-terminal-progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
        </div>
      </div>
      <Caption
        t={t}
        at={4500}
        kicker="Step 01"
        title={
          <>
            One
            <br />
            command.
          </>
        }
        sub="Or drag a folder into the console."
        className="promo-caption-right"
      />
      <Critter
        seed={PROMO_STAR}
        x={1540}
        y={980 - hop * 110 + wave(t, 1300, 6)}
        size={360}
        rotate={wave(t, 1600, 4) + hop * 10}
        sx={1 - hop * 0.06}
        sy={1 + hop * 0.08}
        opacity={enter}
      />
    </div>
  )
}

const FOLDER = { x: 400, y: 690 }
const MOUTH = { x: 1250, y: 700 }

function Gobble({ t }: { t: number }) {
  const arrivals = promoFiles.map(
    (_, index) => gobble.first + index * gobble.every + gobble.flight,
  )
  const gulp = Math.max(...arrivals.map((at) => pulse(t, at, 260)))
  const lastArrival = arrivals[arrivals.length - 1]
  const uploaded = range(t, gobble.first + gobble.flight * 0.6, lastArrival)
  const enter = easeOutBack(range(t, 9000, 9600))
  const folderBulge = Math.max(
    ...promoFiles.map((_, index) =>
      pulse(t, gobble.first + index * gobble.every, 220),
    ),
  )
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'gobble') }}>
      <Caption
        t={t}
        at={9150}
        kicker="Step 02"
        title="Gobble gobble."
        sub="Every file streams straight to private storage, checksummed on the way in."
        className="promo-caption-top"
      />
      <Folder
        x={FOLDER.x}
        y={FOLDER.y + (1 - enter) * 400}
        bulge={folderBulge}
        rotate={-5}
      />
      {promoFiles.map((file, index) => {
        const start = gobble.first + index * gobble.every
        const p = range(t, start, start + gobble.flight)
        if (p <= 0 || p >= 1) return null
        const e = easeInOut(p)
        const control = { x: (FOLDER.x + MOUTH.x) / 2, y: 260 - index * 6 }
        const x =
          (1 - e) ** 2 * FOLDER.x +
          2 * (1 - e) * e * control.x +
          e ** 2 * MOUTH.x
        const y =
          (1 - e) ** 2 * (FOLDER.y - 60) +
          2 * (1 - e) * e * control.y +
          e ** 2 * MOUTH.y
        return (
          <div
            className="promo-file"
            key={file}
            style={{
              left: x,
              top: y,
              opacity: p > 0.86 ? (1 - p) / 0.14 : 1,
              transform: `translate(-50%, -50%) rotate(${lerp(-12, 22, e)}deg) scale(${lerp(1, 0.35, easeInCubic(p))})`,
            }}
          >
            <i>
              {file.endsWith('.html') ? '◇' : file.endsWith('.js') ? '{}' : '▤'}
            </i>
            {file}
          </div>
        )
      })}
      <Critter
        seed={PROMO_STAR}
        x={1250}
        y={960 + (1 - enter) * 600}
        size={480}
        rotate={wave(t, 900, 3) - gulp * 4}
        sx={1 + gulp * 0.1}
        sy={1 - gulp * 0.14}
      />
      <div className="promo-upload">
        <div>
          <b>Uploading {Math.round(uploaded * 42)} / 42</b>
          <span>
            {uploaded >= 1
              ? '✓ every checksum verified'
              : 'SHA-256 · signed URLs'}
          </span>
        </div>
        <div className="promo-upload-track">
          <span style={{ width: `${uploaded * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

const stars = Array.from({ length: 70 }, (_, index) => {
  const a = Math.sin(index * 12.9898) * 43758.5453
  const b = Math.sin(index * 78.233) * 12345.6789
  return {
    x: (a - Math.floor(a)) * 1920,
    y: (b - Math.floor(b)) * 1400,
    size: 2 + ((index * 7) % 5),
  }
})

const pins = [
  { x: 790, y: 640, code: 'IAD' },
  { x: 930, y: 590, code: 'FRA' },
  { x: 1090, y: 650, code: 'SIN' },
  { x: 1150, y: 790, code: 'SYD' },
  { x: 830, y: 800, code: 'GRU' },
]

function Yeeet({ t }: { t: number }) {
  const settle = easeOutCubic(range(t, 15000, 15500))
  const crouch = easeInOut(range(t, 15300, yeeetMoment))
  const shakeIn = range(t, 15500, yeeetMoment)
  const launch = easeInCubic(range(t, yeeetMoment, yeeetMoment + 700))
  const slam = easeOutBack(range(t, yeeetMoment, yeeetMoment + 280))
  const slamOut = range(t, 17300, 17700)
  const night = easeInOut(range(t, 16700, 17400))
  const dawn = easeInOut(range(t, 19300, 19800))
  const climb = Math.max(0, t - 16700) * 0.35
  const parcelP = range(t, 17400, 18350)
  const shake =
    t >= yeeetMoment && t < yeeetMoment + 420
      ? (1 - range(t, yeeetMoment, yeeetMoment + 420)) * 16
      : 0
  const countdown = [3, 2, 1].map((n, index) => {
    const raw = range(t, 15400 + index * 300, 15600 + index * 300)
    return {
      n,
      p: raw > 0 ? easeOutBack(raw) : 0,
      out: range(t, 15600 + index * 300, 15690 + index * 300),
    }
  })
  return (
    <div
      className="promo-scene"
      style={{
        opacity: sceneFade(t, 'yeeet'),
        transform: `translate(${wave(t, 55, shake)}px, ${wave(t, 70, shake, 1)}px)`,
      }}
    >
      <div className="promo-night" style={{ opacity: night * (1 - dawn) }}>
        {stars.map((star, index) => (
          <i
            key={index}
            style={{
              left: star.x,
              top: ((star.y + climb * (0.4 + (index % 3) * 0.3)) % 1400) - 160,
              width: star.size,
              height: star.size,
            }}
          />
        ))}
      </div>
      {t < 17500 ? (
        <>
          <div className="promo-countdown">
            {countdown.map(({ n, p, out }) =>
              p > 0 && out < 1 ? (
                <span
                  key={n}
                  style={{
                    opacity: 1 - out,
                    transform: `scale(${0.4 + p * 0.6 + out * 0.4})`,
                  }}
                >
                  {n}
                </span>
              ) : null,
            )}
          </div>
          <div className="promo-launch-pad" style={{ opacity: 1 - night }} />
          {t >= yeeetMoment && t < yeeetMoment + 900
            ? Array.from({ length: 9 }, (_, index) => (
                <span
                  className="promo-speed"
                  key={index}
                  style={{
                    left: 760 + index * 50,
                    top:
                      (((t - yeeetMoment) * (1.6 + (index % 3) * 0.4) +
                        index * 90) %
                        1200) -
                      200,
                    height: 120 + (index % 4) * 60,
                  }}
                />
              ))
            : null}
          <Critter
            seed={PROMO_STAR}
            x={lerp(1250, 960, settle) + wave(t, 45, shakeIn * crouch * 6)}
            y={960 - launch * 1700}
            size={480}
            sx={launch > 0 ? 0.86 : 1 + crouch * 0.16}
            sy={launch > 0 ? 1.24 : 1 - crouch * 0.28}
            rotate={launch * -8}
          />
          {t >= yeeetMoment ? (
            <span
              className="promo-parcel"
              style={{
                left: 990,
                top: 430 - launch * 1500,
                transform: `translate(-50%, -50%) rotate(${launch * 140}deg)`,
              }}
            >
              ⌑
            </span>
          ) : null}
          <div
            className="promo-yeeet"
            style={{
              opacity: slam * (1 - slamOut),
              transform: `translate(-50%, -50%) rotate(-6deg) scale(${lerp(2.6, 1, slam)}) translateY(${-slamOut * 80}px)`,
            }}
          >
            YEEET!
          </div>
        </>
      ) : null}
      {t >= 17200 ? (
        <>
          <svg
            className="promo-globe"
            viewBox="0 0 700 700"
            style={{
              opacity: easeOutCubic(range(t, 17200, 17700)),
              transform: `translate(-50%, -50%) translateY(${(1 - easeOutCubic(range(t, 17200, 17900))) * 260}px)`,
            }}
            aria-hidden="true"
          >
            <circle cx="350" cy="350" r="300" className="promo-globe-body" />
            {[-200, -100, 0, 100, 200].map((offset) => (
              <ellipse
                key={offset}
                cx="350"
                cy={350 + offset}
                rx={Math.sqrt(300 ** 2 - offset ** 2)}
                ry={Math.sqrt(300 ** 2 - offset ** 2) * 0.16}
                className="promo-globe-line"
              />
            ))}
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const angle = ((index / 6) * Math.PI + t / 2200) % Math.PI
              return (
                <ellipse
                  key={index}
                  cx="350"
                  cy="350"
                  rx={Math.abs(Math.cos(angle)) * 300}
                  ry="300"
                  className="promo-globe-line"
                />
              )
            })}
          </svg>
          {parcelP > 0 && parcelP < 1 ? (
            <span
              className="promo-parcel promo-parcel-streak"
              style={{
                left: lerp(200, 960, easeInOut(parcelP)),
                top:
                  lerp(160, 560, easeInOut(parcelP)) -
                  Math.sin(parcelP * Math.PI) * 180,
                transform: `translate(-50%, -50%) rotate(${parcelP * 540}deg)`,
              }}
            >
              ⌑
            </span>
          ) : null}
          {pins.map((pin, index) => {
            const p = easeOutCubic(
              range(t, 18350 + index * 60, 18800 + index * 60),
            )
            if (p <= 0) return null
            const fly = range(t, 18350, 18650)
            const x = lerp(960, pin.x, easeOutCubic(fly))
            const y = lerp(560, pin.y, easeOutCubic(fly))
            const ripple = ((t - 18650 - index * 120) % 1100) / 1100
            return (
              <div
                className="promo-pin"
                key={pin.code}
                style={{ left: x, top: y, opacity: p }}
              >
                {t > 18650 ? (
                  <i
                    style={{
                      transform: `translate(-50%, -50%) scale(${1 + ripple * 3})`,
                      opacity: 1 - ripple,
                    }}
                  />
                ) : null}
                <b />
                {t > 18700 ? <span>{pin.code}</span> : null}
              </div>
            )
          })}
          <Sparks t={t} at={18350} x={960} y={560} count={10} radius={120} />
          <Caption
            t={t}
            at={17500}
            title="Flung to the edge."
            sub="Cached worldwide. Atomic flip once every byte has landed."
            className="promo-caption-top promo-caption-night"
          />
        </>
      ) : null}
    </div>
  )
}

function Touchdown({ t }: { t: number }) {
  const drop = easeOutBack(range(t, 19700, 20250))
  const fall = easeInCubic(range(t, 20000, touchdownMoment))
  const landed = t >= touchdownMoment
  const squash = landed
    ? 1 - easeOutBack(range(t, touchdownMoment, touchdownMoment + 380))
    : 0
  const stamp = easeOutBack(range(t, liveStamp, liveStamp + 300))
  const exit = easeInCubic(range(t, 24800, 25200))
  const lines = [0.92, 0.78, 0.86, 0.6]
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'touchdown') }}>
      <Caption
        t={t}
        at={19900}
        kicker="Step 03"
        title={
          <>
            Live.
            <br />
            HTTPS.
            <br />
            Instantly.
          </>
        }
        sub="A permanent URL in about two seconds."
        className="promo-caption-left"
      />
      <div
        className="promo-browser"
        style={{
          transform: `translate(-50%, ${lerp(-900, 0, drop) + exit * 60}px)`,
        }}
      >
        <div className="promo-browser-bar">
          <span>
            <i />
            <i />
            <i />
          </span>
          <div className="promo-address">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            https://{SITE_HOST}
          </div>
        </div>
        <div className="promo-site">
          <div className="promo-site-hero">
            <span>☄</span>
            <div>
              <b>Comet</b>
              {lines.slice(0, 2).map((width, index) => (
                <i key={index} style={{ width: `${width * 100}%` }} />
              ))}
              <em>Get started</em>
            </div>
          </div>
          <div className="promo-site-cards">
            {lines.map((width, index) => (
              <div key={index}>
                <i style={{ width: `${width * 100}%` }} />
                <i style={{ width: `${width * 60}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div
          className="promo-live-stamp"
          style={{
            opacity: clamp(stamp * 2),
            transform: `rotate(-8deg) scale(${lerp(2.2, 1, stamp)})`,
          }}
        >
          <i /> LIVE in 1.8s
        </div>
      </div>
      <Critter
        seed={PROMO_STAR}
        x={1590}
        y={lerp(-260, 248, fall) + exit * 60}
        size={250}
        sx={1 + squash * 0.24}
        sy={1 - squash * 0.3}
        rotate={landed ? wave(t, 1400, 4) : 12}
        z={6}
      />
      <Sparks t={t} at={touchdownMoment} x={1590} y={230} />
      <Sparks t={t} at={liveStamp} x={800} y={880} count={6} radius={110} />
    </div>
  )
}

const versions = [
  { id: 'v1', label: 'first yeeet', when: 'Oct 1' },
  { id: 'v2', label: 'new fonts', when: 'Oct 4' },
  { id: 'v3', label: 'pricing page', when: 'Oct 9' },
  { id: 'v4', label: 'big redesign', when: 'just now' },
]
const versionX = [390, 770, 1150, 1530]

function Rollback({ t }: { t: number }) {
  const rolledBack = t >= rollbackHop + 420
  const liveIndex = rolledBack ? 2 : 3
  const hop = range(t, rollbackHop, rollbackHop + 420)
  const landSquash = rolledBack
    ? 1 - easeOutBack(range(t, rollbackHop + 420, rollbackHop + 760))
    : 0
  const critterX = lerp(versionX[3], versionX[2], easeInOut(hop))
  const critterY = 470 - Math.sin(hop * Math.PI) * 220
  const cursorP = easeInOut(range(t, 26200, rollbackClick - 80))
  const press = pulse(t, rollbackClick, 200)
  const cursorX = lerp(1780, versionX[3] + 40, cursorP)
  const cursorY = lerp(1040, 744, cursorP)
  const toast = easeOutBack(range(t, 28200, 28600))
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'rollback') }}>
      <Caption
        t={t}
        at={25200}
        kicker="Every deploy is immutable"
        title="Changed your mind?"
        sub="Every version keeps its own URL. Roll back in one click, with zero downtime."
        className="promo-caption-top"
      />
      {versions.map((version, index) => {
        const enter = easeOutBack(
          range(t, 25300 + index * 120, 25800 + index * 120),
        )
        const live = index === liveIndex
        return (
          <article
            key={version.id}
            className={`promo-version ${live ? 'is-live' : ''}`}
            style={{
              left: versionX[index],
              transform: `translate(-50%, ${(1 - enter) * 300}px) rotate(${(index - 1.5) * 1.2}deg)`,
              opacity: clamp(enter * 1.5),
            }}
          >
            <header>
              <b>{version.id}</b>
              <span>{live ? '● LIVE' : 'READY'}</span>
            </header>
            <p>{version.label}</p>
            <small>
              {version.when} · v-{(index + 3) * 1231}a.
              {SITE_HOST.split('.').slice(1).join('.')}
            </small>
            {index === 3 ? (
              <em
                className={`promo-rollback-button ${press > 0 ? 'is-pressed' : ''}`}
                style={{ opacity: rolledBack ? 0.35 : 1 }}
              >
                ↶ Roll back
              </em>
            ) : null}
          </article>
        )
      })}
      <Critter
        seed={PROMO_STAR}
        x={critterX}
        y={critterY}
        size={180}
        sx={1 + landSquash * 0.2}
        sy={1 - landSquash * 0.26 + (hop > 0 && hop < 1 ? 0.12 : 0)}
        rotate={hop > 0 && hop < 1 ? -18 : wave(t, 1200, 4)}
        opacity={easeOutCubic(range(t, 25900, 26300))}
        z={6}
      />
      {t < 28000 ? (
        <svg
          className="promo-cursor-arrow"
          viewBox="0 0 24 24"
          style={{
            left: cursorX,
            top: cursorY,
            opacity:
              easeOutCubic(range(t, 26000, 26300)) *
              (1 - range(t, 27700, 28000)),
            transform: `scale(${1 - press * 0.18})`,
          }}
          aria-hidden="true"
        >
          <path d="M4 2l15 11-7 1 4 8-3 1.5-4-8-5 5z" />
        </svg>
      ) : null}
      <Sparks
        t={t}
        at={rollbackHop + 420}
        x={versionX[2]}
        y={470}
        count={6}
        radius={100}
      />
      <div
        className="promo-toast"
        style={{
          opacity: clamp(toast * 1.4),
          transform: `translate(-50%, ${(1 - toast) * 120}px)`,
        }}
      >
        <i>✓</i> comet rolled back to <b>v3</b> · 0s downtime
      </div>
    </div>
  )
}

const json = `{
  "status": "ready",
  "url": "https://docs.site.yeeet.dev",
  "deployment": "dpl_7f3a…"
}`
const chips = [
  { at: 31_000, icon: '>_', label: 'CLI' },
  { at: 31_400, icon: '⑂', label: 'GitHub Action' },
  { at: 31_800, icon: '◎', label: 'MCP server' },
  { at: 32_200, icon: '{ }', label: 'REST + OpenAPI' },
]

function Agents({ t }: { t: number }) {
  const enter = easeOutCubic(range(t, 30400, 30900))
  const typed = Math.floor(range(t, 30900, 32500) * json.length)
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'agents') }}>
      <div
        className="promo-agent-panel"
        style={{ transform: `scale(${lerp(0.94, 1, enter)})` }}
      >
        <div className="promo-agent-copy">
          <span className="promo-kicker">Robots welcome</span>
          <h2>
            Humans, CI,
            <br />
            and agents.
          </h2>
          <p>
            Stable JSON, honest exit codes, and API keys built for automation.
          </p>
          <div className="promo-chips">
            {chips.map((chip) => {
              const pop = easeOutBack(range(t, chip.at, chip.at + 360))
              return (
                <span
                  key={chip.label}
                  style={{
                    opacity: clamp(pop * 2),
                    transform: `scale(${pop})`,
                  }}
                >
                  <i>{chip.icon}</i>
                  {chip.label}
                </span>
              )
            })}
          </div>
        </div>
        <pre className="promo-json">
          <code>
            {json.slice(0, typed)}
            {typed < json.length && Math.floor(t / 400) % 2 ? '▍' : ''}
          </code>
        </pre>
      </div>
      <Critter
        seed={PROMO_AGENT}
        sticker
        x={560}
        y={1000 + (1 - enter) * 300 + wave(t, 1100, 8)}
        size={380}
        rotate={wave(t, 1700, 5)}
        z={6}
      />
    </div>
  )
}

const crew = [
  'cosmic-pickle',
  'turbo-waffle',
  'docs',
  PROMO_STAR,
  'spicy-meteor',
  'fuzzy-rocket',
  'launch-control',
]

function Finale({ t }: { t: number }) {
  const logo = easeOutBack(range(t, 34800, 35400))
  const tag = easeOutCubic(range(t, 35200, 35800))
  const pill = easeOutCubic(range(t, 36200, 36800))
  return (
    <div className="promo-scene" style={{ opacity: sceneFade(t, 'finale') }}>
      <div
        className="promo-logo"
        style={{
          opacity: clamp(logo * 2),
          transform: `translate(-50%, -50%) scale(${lerp(0.6, 1, logo)})`,
        }}
      >
        <span>Y!</span>
        yeeet
      </div>
      <h2
        className="promo-tagline"
        style={{
          opacity: tag,
          transform: `translate(-50%, ${(1 - tag) * 30}px)`,
        }}
      >
        Build it. <em>Yeeet it.</em>
      </h2>
      <div
        className="promo-url"
        style={{
          opacity: pill,
          transform: `translate(-50%, ${(1 - pill) * 20}px)`,
        }}
      >
        <b>yeeet.dev</b>
        <span>npm i -g @yeeet.dev/cli</span>
      </div>
      {crew.map((seed, index) => {
        const start = finaleCrewStart + index * 140
        const pop = easeOutBack(range(t, start, start + 500))
        const bounce =
          t > start + 500
            ? Math.abs(
                Math.sin(((t - start - 500) / 520) * Math.PI + index * 0.55),
              ) * 26
            : 0
        const star = seed === PROMO_STAR
        return (
          <Critter
            key={seed}
            seed={seed}
            x={300 + index * 220}
            y={lerp(1400, star ? 1070 : 1050, pop) - bounce}
            size={star ? 260 : 200}
            rotate={wave(t, 900, 5, index)}
          />
        )
      })}
      <Sparks t={t} at={34900} x={960} y={330} count={10} radius={260} />
    </div>
  )
}

export function PromoFilm({ t }: { t: number }) {
  return (
    <div className="promo-stage" aria-hidden="true">
      <div className="promo-grid" />
      {active(t, 'intro') ? <Intro t={t} /> : null}
      {active(t, 'terminal') ? <Terminal t={t} /> : null}
      {active(t, 'gobble') ? <Gobble t={t} /> : null}
      {active(t, 'yeeet') ? <Yeeet t={t} /> : null}
      {active(t, 'touchdown') ? <Touchdown t={t} /> : null}
      {active(t, 'rollback') ? <Rollback t={t} /> : null}
      {active(t, 'agents') ? <Agents t={t} /> : null}
      {active(t, 'finale') ? <Finale t={t} /> : null}
    </div>
  )
}
