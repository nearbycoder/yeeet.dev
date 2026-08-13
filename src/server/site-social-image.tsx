import { Resvg } from '@resvg/resvg-js'
import { renderToStaticMarkup } from 'react-dom/server'
import { YeeetlingArtwork, getYeeetlingDesign } from '#/components/yeeetling'

export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630

export function displayNameFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function titleLines(title: string) {
  let remaining = title.replace(/\s+/g, ' ').trim() || 'Untitled Site'
  const lines: Array<string> = []

  while (remaining && lines.length < 2) {
    if (remaining.length <= 14) {
      lines.push(remaining)
      remaining = ''
      break
    }
    const naturalBreak = remaining.lastIndexOf(' ', 14)
    const breakAt = naturalBreak >= 7 ? naturalBreak : 14
    lines.push(remaining.slice(0, breakAt).trimEnd())
    remaining = remaining.slice(breakAt).trimStart()
  }

  if (remaining) lines[1] = `${lines[1].slice(0, 12).trimEnd()}…`
  return lines
}

function compactHostname(hostname: string) {
  if (hostname.length <= 48) return hostname
  return `${hostname.slice(0, 27)}…${hostname.slice(-20)}`
}

export function siteSocialImageSvg(input: { hostname: string; slug: string }) {
  const design = getYeeetlingDesign(input.slug)
  const title = displayNameFromSlug(input.slug)
  const lines = titleLines(title)
  const titleFontSize =
    Math.max(...lines.map((line) => line.length)) > 12 ? 70 : 82
  const subtitle = `${design.name} keeps this site airborne.`

  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={SOCIAL_IMAGE_WIDTH}
      height={SOCIAL_IMAGE_HEIGHT}
      viewBox={`0 0 ${SOCIAL_IMAGE_WIDTH} ${SOCIAL_IMAGE_HEIGHT}`}
    >
      <defs>
        <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M42 0H0V42" fill="none" stroke="#ddd7ca" strokeWidth="1" />
        </pattern>
        <filter id="shadow" x="-30%" y="-30%" width="170%" height="170%">
          <feDropShadow dx="12" dy="14" stdDeviation="0" floodColor="#f04d2f" />
        </filter>
      </defs>

      <rect width="1200" height="630" fill="#f5f1e8" />
      <rect width="1200" height="630" fill="url(#grid)" opacity="0.62" />
      <path d="M0 0H1200V18H0Z" fill="#181815" />

      <g transform="translate(58 52)">
        <rect width="58" height="58" rx="14" fill="#181815" />
        <text
          x="29"
          y="39"
          textAnchor="middle"
          fill="#f5f1e8"
          fontFamily="Arial, sans-serif"
          fontSize="26"
          fontWeight="900"
        >
          Y!
        </text>
        <text
          x="76"
          y="39"
          fill="#181815"
          fontFamily="Arial, sans-serif"
          fontSize="27"
          fontWeight="800"
        >
          yeeet
        </text>
      </g>

      <g transform="translate(62 176)">
        <circle cx="7" cy="-21" r="7" fill="#f04d2f" />
        <text
          x="27"
          y="-14"
          fill="#181815"
          fontFamily="monospace"
          fontSize="16"
          fontWeight="700"
          letterSpacing="3"
        >
          NOW LIVE / STATIC SITE
        </text>
        <text
          x="0"
          y="70"
          fill="#181815"
          fontFamily="Arial, sans-serif"
          fontSize={titleFontSize}
          fontWeight="900"
          letterSpacing="-4"
        >
          {lines.map((line, index) => (
            <tspan key={`${index}-${line}`} x="0" dy={index === 0 ? 0 : 82}>
              {line}
            </tspan>
          ))}
        </text>
        <text
          x="3"
          y={lines.length === 1 ? 190 : 272}
          fill="#6e6a61"
          fontFamily="Arial, sans-serif"
          fontSize="25"
        >
          {subtitle}
        </text>
      </g>

      <g filter="url(#shadow)">
        <path
          d="M790 102C900 44 1056 84 1111 193C1170 310 1107 464 983 514C858 565 719 480 710 346C702 234 712 143 790 102Z"
          fill="#fffdf8"
          stroke="#181815"
          strokeWidth="6"
        />
      </g>
      <ellipse
        cx="921"
        cy="308"
        rx="183"
        ry="203"
        fill="none"
        stroke="#c9c3b7"
        strokeWidth="2"
        strokeDasharray="9 10"
        transform="rotate(-18 921 308)"
      />
      <circle
        cx="1081"
        cy="188"
        r="13"
        fill="#d9ee55"
        stroke="#181815"
        strokeWidth="4"
      />
      <circle
        cx="744"
        cy="367"
        r="9"
        fill="#f04d2f"
        stroke="#181815"
        strokeWidth="4"
      />
      <svg x="765" y="135" width="324" height="324" viewBox="0 0 160 160">
        <g transform={`rotate(${design.tilt} 80 80)`}>
          <YeeetlingArtwork design={design} clipId="yeeetling-social-card" />
        </g>
      </svg>

      <g transform="translate(62 533)">
        <rect width="1076" height="62" rx="31" fill="#181815" />
        <circle cx="31" cy="31" r="13" fill="#d9ee55" />
        <text
          x="58"
          y="40"
          fill="#f5f1e8"
          fontFamily="monospace"
          fontSize="22"
          fontWeight="700"
        >
          {compactHostname(input.hostname)}
        </text>
        <text
          x="1038"
          y="40"
          textAnchor="end"
          fill="#f04d2f"
          fontFamily="Arial, sans-serif"
          fontSize="20"
          fontWeight="800"
        >
          DEPLOYED WITH YEEET ↗
        </text>
      </g>
    </svg>,
  )
}

export function renderSiteSocialImage(input: {
  hostname: string
  slug: string
}) {
  const renderer = new Resvg(siteSocialImageSvg(input), {
    fitTo: { mode: 'original' },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Arial',
      sansSerifFamily: 'Arial',
      monospaceFamily: 'monospace',
    },
    shapeRendering: 2,
    textRendering: 1,
  })
  return renderer.render().asPng()
}
