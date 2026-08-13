import { useId } from 'react'
import type { CSSProperties } from 'react'

export type YeeetlingPhase =
  'idle' | 'ready' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error'

const palettes = [
  ['#d9ee55', '#f04d2f'],
  ['#ff8bb5', '#ffe866'],
  ['#71e3ff', '#845ef7'],
  ['#ff8a51', '#c8ff61'],
  ['#9b8cff', '#ffcf56'],
  ['#62dfb5', '#ff6b6b'],
  ['#ffd85a', '#f45d9b'],
  ['#b8f2e6', '#ff7c5c'],
] as const

const bodyPaths = [
  'M43 45C47 25 67 19 86 24C110 19 127 37 122 61C134 80 122 111 101 119C80 134 43 121 38 96C25 78 29 56 43 45Z',
  'M80 24C111 24 129 45 125 76C132 103 111 124 81 124C48 127 29 108 34 78C27 48 48 25 80 24Z',
  'M48 31C68 20 100 25 112 43L127 86C135 110 111 127 88 120L48 124C27 125 24 99 33 82L34 50C34 41 39 35 48 31Z',
  'M52 27C74 16 105 27 108 50C131 58 136 84 119 99C111 125 78 132 59 116C34 121 22 96 35 78C23 55 33 35 52 27Z',
  'M80 20L101 35L126 37L127 62L141 82L124 101L118 124L93 125L73 139L55 122L30 118L31 93L19 71L38 54L45 31L68 33L80 20Z',
  'M46 28C65 18 89 25 98 42C123 35 139 57 128 78C140 103 113 125 91 115C72 134 42 120 43 97C19 88 23 57 42 49C39 40 40 33 46 28Z',
] as const

const firstNames = [
  'Bloop',
  'Fizz',
  'Wobble',
  'Zorp',
  'Mochi',
  'Boing',
  'Niblet',
  'Pogo',
  'Sprocket',
  'Bonk',
  'Zip',
  'Noodle',
] as const

const lastNames = [
  'Comet',
  'Goblin',
  'Rocket',
  'Bean',
  'Meteor',
  'Gremlin',
  'Spark',
  'Orbit',
  'Crumb',
  'Zoomer',
  'Blob',
  'Satellite',
] as const

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function designValues(seed: string) {
  let state = hashSeed(seed || 'yeeet') || 0x6d2b79f5
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

export function getYeeetlingDesign(seed: string) {
  const next = designValues(seed.toLowerCase())
  const palette = next() % palettes.length
  const body = next() % bodyPaths.length
  const eyes = next() % 6
  const mouth = next() % 5
  const antenna = next() % 5
  const marking = next() % 7
  const feet = next() % 4
  const tilt = (next() % 9) - 4
  const name = `${firstNames[next() % firstNames.length]} ${lastNames[next() % lastNames.length]}`
  return {
    palette,
    body,
    eyes,
    mouth,
    antenna,
    marking,
    feet,
    tilt,
    name,
  }
}

export type YeeetlingDesign = ReturnType<typeof getYeeetlingDesign>

function Eyes({ kind }: { kind: number }) {
  if (kind === 1)
    return (
      <>
        <circle cx="80" cy="67" r="20" fill="#fffdf8" />
        <circle cx="84" cy="69" r="9" fill="#181815" />
        <circle cx="88" cy="65" r="3" fill="white" />
      </>
    )
  if (kind === 2)
    return (
      <>
        <circle cx="61" cy="65" r="8" fill="#181815" />
        <circle cx="81" cy="59" r="8" fill="#181815" />
        <circle cx="101" cy="65" r="8" fill="#181815" />
        <circle cx="64" cy="62" r="2" fill="white" />
        <circle cx="84" cy="56" r="2" fill="white" />
        <circle cx="104" cy="62" r="2" fill="white" />
      </>
    )
  if (kind === 3)
    return (
      <>
        <path
          d="M50 67C61 55 99 55 112 67C100 81 62 81 50 67Z"
          fill="#181815"
        />
        <circle cx="70" cy="67" r="5" fill="white" />
        <circle cx="94" cy="67" r="5" fill="white" />
      </>
    )
  if (kind === 4)
    return (
      <>
        <path
          d="M52 67Q62 59 72 67"
          fill="none"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M90 67Q100 59 110 67"
          fill="none"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </>
    )
  if (kind === 5)
    return (
      <>
        <circle
          cx="62"
          cy="66"
          r="13"
          fill="#fffdf8"
          stroke="#181815"
          strokeWidth="4"
        />
        <circle cx="101" cy="66" r="7" fill="#181815" />
        <circle cx="65" cy="68" r="6" fill="#181815" />
        <circle cx="67" cy="65" r="2" fill="white" />
        <circle cx="103" cy="64" r="2" fill="white" />
      </>
    )
  return (
    <>
      <circle cx="62" cy="66" r="11" fill="#fffdf8" />
      <circle cx="101" cy="66" r="11" fill="#fffdf8" />
      <circle cx="65" cy="69" r="5" fill="#181815" />
      <circle cx="104" cy="69" r="5" fill="#181815" />
    </>
  )
}

function Mouth({ kind }: { kind: number }) {
  if (kind === 1)
    return (
      <path
        d="M68 92Q81 106 96 91"
        fill="none"
        stroke="#181815"
        strokeWidth="5"
        strokeLinecap="round"
      />
    )
  if (kind === 2)
    return <path d="M67 89Q82 78 99 90Q86 108 67 89Z" fill="#181815" />
  if (kind === 3)
    return (
      <>
        <path
          d="M66 90H99"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M74 90V98M91 90V98" stroke="#181815" strokeWidth="3" />
      </>
    )
  if (kind === 4) return <circle cx="82" cy="92" r="9" fill="#181815" />
  return (
    <path
      d="M69 91Q81 99 96 90"
      fill="none"
      stroke="#181815"
      strokeWidth="5"
      strokeLinecap="round"
    />
  )
}

function Antenna({ kind, accent }: { kind: number; accent: string }) {
  if (kind === 0) return null
  if (kind === 1)
    return (
      <g className="yeeetling-antenna">
        <path
          d="M80 34Q77 15 91 8"
          fill="none"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle
          cx="93"
          cy="8"
          r="7"
          fill={accent}
          stroke="#181815"
          strokeWidth="4"
        />
      </g>
    )
  if (kind === 2)
    return (
      <g className="yeeetling-antenna">
        <path
          d="M67 35Q55 16 47 13M95 34Q106 16 116 14"
          fill="none"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle
          cx="46"
          cy="12"
          r="6"
          fill={accent}
          stroke="#181815"
          strokeWidth="3"
        />
        <circle
          cx="117"
          cy="13"
          r="6"
          fill={accent}
          stroke="#181815"
          strokeWidth="3"
        />
      </g>
    )
  if (kind === 3)
    return (
      <g className="yeeetling-antenna">
        <path
          d="M79 35V11"
          stroke="#181815"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M67 12H91L79 1L67 12Z"
          fill={accent}
          stroke="#181815"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    )
  return (
    <g className="yeeetling-antenna">
      <path
        d="M72 35Q66 21 56 15M90 35Q96 21 106 16"
        fill="none"
        stroke="#181815"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M48 9L63 13L54 25Z"
        fill={accent}
        stroke="#181815"
        strokeWidth="3"
      />
      <path
        d="M114 9L100 14L108 25Z"
        fill={accent}
        stroke="#181815"
        strokeWidth="3"
      />
    </g>
  )
}

function Marking({ kind, accent }: { kind: number; accent: string }) {
  if (kind === 0) return null
  if (kind === 1)
    return <path d="M30 89L132 53V77L35 111Z" fill={accent} opacity=".78" />
  if (kind === 2)
    return (
      <>
        <circle cx="47" cy="90" r="11" fill={accent} />
        <circle cx="112" cy="43" r="9" fill={accent} />
        <circle cx="109" cy="102" r="7" fill={accent} />
      </>
    )
  if (kind === 3)
    return (
      <path
        d="M80 21L93 48L123 52L101 74L106 104L80 90L53 104L59 74L37 52L67 48Z"
        fill={accent}
        opacity=".55"
      />
    )
  if (kind === 4)
    return (
      <path
        d="M38 51Q80 76 124 47V66Q81 94 35 69Z"
        fill={accent}
        opacity=".72"
      />
    )
  if (kind === 5)
    return (
      <>
        <path d="M47 34L59 119" stroke={accent} strokeWidth="12" />
        <path d="M83 24L91 124" stroke={accent} strokeWidth="8" />
        <path d="M113 35L119 106" stroke={accent} strokeWidth="11" />
      </>
    )
  return (
    <path d="M29 82Q80 49 132 82Q80 118 29 82Z" fill={accent} opacity=".55" />
  )
}

export function YeeetlingArtwork({
  design,
  clipId,
}: {
  design: YeeetlingDesign
  clipId: string
}) {
  const [body, accent] = palettes[design.palette]

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={bodyPaths[design.body]} />
        </clipPath>
      </defs>
      <g className="yeeetling-parts">
        <Antenna kind={design.antenna} accent={accent} />
        <path
          className="yeeetling-arm yeeetling-arm-left"
          d="M43 76Q18 67 13 85"
          fill="none"
          stroke="#181815"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          className="yeeetling-arm yeeetling-arm-right"
          d="M119 76Q143 65 148 84"
          fill="none"
          stroke="#181815"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d={bodyPaths[design.body]}
          fill={body}
          stroke="#181815"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${clipId})`}>
          <Marking kind={design.marking} accent={accent} />
        </g>
        <path
          d={bodyPaths[design.body]}
          fill="none"
          stroke="#181815"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <g className="yeeetling-face">
          <Eyes kind={design.eyes} />
          <Mouth kind={design.mouth} />
        </g>
        {design.feet === 0 ? (
          <>
            <path
              d="M58 118L55 140"
              stroke="#181815"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M102 118L106 140"
              stroke="#181815"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </>
        ) : design.feet === 1 ? (
          <>
            <path
              d="M57 119Q44 139 59 143"
              fill="none"
              stroke="#181815"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M104 117Q119 138 104 143"
              fill="none"
              stroke="#181815"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </>
        ) : design.feet === 2 ? (
          <path
            d="M50 126Q80 145 112 125"
            fill="none"
            stroke="#181815"
            strokeWidth="8"
            strokeLinecap="round"
          />
        ) : (
          <>
            <ellipse
              cx="58"
              cy="139"
              rx="15"
              ry="7"
              fill={accent}
              stroke="#181815"
              strokeWidth="4"
            />
            <ellipse
              cx="105"
              cy="139"
              rx="15"
              ry="7"
              fill={accent}
              stroke="#181815"
              strokeWidth="4"
            />
          </>
        )}
      </g>
    </>
  )
}

export function Yeeetling({
  seed,
  phase = 'idle',
  compact = false,
  label,
}: {
  seed: string
  phase?: YeeetlingPhase
  compact?: boolean
  label?: string
}) {
  const design = getYeeetlingDesign(seed)
  const instanceId = useId().replaceAll(':', '')
  const clipId = `yeeetling-${hashSeed(seed).toString(36)}-${design.body}-${instanceId}`
  const style = {
    '--yeeetling-tilt': `${design.tilt}deg`,
    '--yeeetling-accent': palettes[design.palette][1],
  } as CSSProperties

  return (
    <div
      className={`yeeetling yeeetling-${phase} ${compact ? 'yeeetling-compact' : ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="yeeetling-speed yeeetling-speed-one" />
      <span className="yeeetling-speed yeeetling-speed-two" />
      <span className="yeeetling-spark yeeetling-spark-one">✦</span>
      <span className="yeeetling-spark yeeetling-spark-two">+</span>
      <span className="yeeetling-parcel">⌑</span>
      <div className="yeeetling-motion">
        <svg viewBox="0 0 160 160" focusable="false">
          <YeeetlingArtwork design={design} clipId={clipId} />
        </svg>
      </div>
    </div>
  )
}
