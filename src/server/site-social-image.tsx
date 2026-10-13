import { Resvg } from '@resvg/resvg-js'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { YeeetlingArtwork, getYeeetlingDesign } from '#/components/yeeetling'

export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630

const require = createRequire(import.meta.url)
const socialFontFiles = [
  require.resolve('@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf'),
  require.resolve('@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf'),
  require.resolve('@expo-google-fonts/open-sans/800ExtraBold/OpenSans_800ExtraBold.ttf'),
]

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

  const subtitleY = lines.length === 1 ? 128 : 210

  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={SOCIAL_IMAGE_WIDTH}
      height={SOCIAL_IMAGE_HEIGHT}
      viewBox={`0 0 ${SOCIAL_IMAGE_WIDTH} ${SOCIAL_IMAGE_HEIGHT}`}
    >
      <defs>
        <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M42 0H0V42" fill="none" stroke="#e2e3db" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="1200" height="630" fill="#f7f7f4" />
      <rect width="1200" height="630" fill="url(#grid)" />

      <g transform="translate(62 54)">
        <g transform="rotate(-3 29 29)">
          <rect width="58" height="58" rx="14" fill="#181815" />
          <text
            x="29"
            y="39"
            textAnchor="middle"
            fill="#f7f7f4"
            fontFamily="Open Sans, sans-serif"
            fontSize="26"
            fontWeight="800"
          >
            Y!
          </text>
        </g>
        <text
          x="76"
          y="39"
          fill="#181815"
          fontFamily="Open Sans, sans-serif"
          fontSize="27"
          fontWeight="800"
          letterSpacing="-1"
        >
          yeeet
        </text>
      </g>

      <g transform="translate(62 214)">
        <circle cx="7" cy="-21" r="7" fill="#f04d2f" />
        <circle
          cx="7"
          cy="-21"
          r="12"
          fill="none"
          stroke="#f04d2f"
          strokeOpacity="0.25"
          strokeWidth="5"
        />
        <text
          x="27"
          y="-14"
          fill="#181815"
          fontFamily="Open Sans, sans-serif"
          fontSize="16"
          fontWeight="700"
          letterSpacing="3"
        >
          NOW LIVE / STATIC SITE
        </text>
        <text
          x="-2"
          y="62"
          fill="#181815"
          fontFamily="Open Sans, sans-serif"
          fontSize={titleFontSize}
          fontWeight="800"
          letterSpacing="-4"
        >
          {lines.map((line, index) => (
            <tspan key={`${index}-${line}`} x="-2" dy={index === 0 ? 0 : 82}>
              {line}
            </tspan>
          ))}
        </text>
        <text
          x="1"
          y={subtitleY}
          fill="#61665c"
          fontFamily="Open Sans, sans-serif"
          fontSize="25"
        >
          {subtitle}
        </text>
      </g>

      <ellipse
        cx="930"
        cy="270"
        rx="250"
        ry="170"
        fill="none"
        stroke="#181815"
        strokeWidth="3"
        opacity="0.7"
        transform="rotate(-20 930 270)"
      />
      <ellipse
        cx="930"
        cy="290"
        rx="240"
        ry="150"
        fill="none"
        stroke="#181815"
        strokeWidth="2"
        strokeDasharray="10 10"
        opacity="0.25"
        transform="rotate(34 930 290)"
      />
      <ellipse cx="942" cy="452" rx="196" ry="56" fill="#181815" />
      <ellipse
        cx="930"
        cy="440"
        rx="196"
        ry="56"
        fill="#f04d2f"
        stroke="#181815"
        strokeWidth="5"
      />
      <ellipse
        cx="930"
        cy="430"
        rx="108"
        ry="16"
        fill="#fbe0d9"
        fillOpacity="0.35"
        stroke="#181815"
        strokeWidth="3"
      />
      <g transform="translate(1082 92) rotate(14)">
        <rect x="3" y="3" width="64" height="54" rx="9" fill="#181815" />
        <rect
          width="64"
          height="54"
          rx="9"
          fill="#d9ee55"
          stroke="#181815"
          strokeWidth="4"
        />
        <path
          d="M20 18h24v18H20zM20 27h24M32 18v18"
          fill="none"
          stroke="#181815"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>
      <path d="M742 132l7 16 16 7-16 7-7 16-7-16-16-7 16-7z" fill="#f04d2f" />
      <path d="M1126 330l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#181815" />
      <svg x="768" y="96" width="324" height="324" viewBox="0 0 160 160">
        <g transform={`rotate(${design.tilt} 80 150)`}>
          <YeeetlingArtwork design={design} clipId="yeeetling-social-card" />
        </g>
      </svg>

      <g transform="translate(62 533)">
        <rect width="1076" height="62" rx="31" fill="#181815" />
        <circle cx="31" cy="31" r="13" fill="#d9ee55" />
        <text
          x="58"
          y="40"
          fill="#f7f7f4"
          fontFamily="Open Sans, sans-serif"
          fontSize="22"
          fontWeight="700"
        >
          {compactHostname(input.hostname)}
        </text>
        <text
          x="1010"
          y="40"
          textAnchor="end"
          fill="#f04d2f"
          fontFamily="Open Sans, sans-serif"
          fontSize="20"
          fontWeight="800"
          letterSpacing="1"
        >
          DEPLOYED WITH YEEET
        </text>
        <path
          d="M1022 39l12-12M1024 27h10v10"
          fill="none"
          stroke="#f04d2f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
      fontFiles: socialFontFiles,
      loadSystemFonts: false,
      defaultFontFamily: 'Open Sans',
      sansSerifFamily: 'Open Sans',
      monospaceFamily: 'Open Sans',
    },
    shapeRendering: 2,
    textRendering: 1,
  })
  return renderer.render().asPng()
}
