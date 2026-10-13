// One source of truth for the promo film. The page, the frame renderer, and
// the soundtrack synthesizer all read these timings, so picture and sound
// stay locked together.

export const PROMO_WIDTH = 1920
export const PROMO_HEIGHT = 1080
export const PROMO_FPS = 30
export const PROMO_DURATION = 40_000
export const PROMO_BPM = 120

export const PROMO_STAR = 'comet'
export const PROMO_AGENT = 'docs'
export const PROMO_COMMAND = 'yeeet deploy ./dist --name comet'

export const scenes = {
  intro: { start: 0, end: 4400 },
  terminal: { start: 4200, end: 9200 },
  gobble: { start: 9000, end: 15200 },
  yeeet: { start: 15000, end: 19800 },
  touchdown: { start: 19600, end: 25200 },
  rollback: { start: 25000, end: 30600 },
  agents: { start: 30400, end: 34800 },
  finale: { start: 34600, end: PROMO_DURATION },
} as const

export type PromoScene = keyof typeof scenes

export const promoFiles = [
  'index.html',
  'assets/app.js',
  'assets/app.css',
  'images/hero.webp',
  'about/index.html',
  'favicon.svg',
  'fonts/brand.woff2',
  'manifest.json',
] as const

// Terminal typing runs between these marks, one keystroke per character.
export const typing = { start: 4900, end: 6900 }
export const gobble = { first: 9900, every: 520, flight: 760 }
export const yeeetMoment = 16_300
export const touchdownMoment = 20_500
export const liveStamp = 21_500
export const rollbackClick = 27_200
export const rollbackHop = 27_700
export const finaleCrewStart = 35_400

export type PromoCue = {
  at: number
  sound:
    | 'type'
    | 'enter'
    | 'gulp'
    | 'rumble'
    | 'whoosh'
    | 'boing'
    | 'ding'
    | 'click'
    | 'pop'
    | 'sparkle'
    | 'crash'
}

export function promoCues(): Array<PromoCue> {
  const cues: Array<PromoCue> = [{ at: 600, sound: 'pop' }]
  const keystroke = (typing.end - typing.start) / PROMO_COMMAND.length
  for (let index = 0; index < PROMO_COMMAND.length; index++) {
    if (PROMO_COMMAND[index] !== ' ')
      cues.push({ at: typing.start + index * keystroke, sound: 'type' })
  }
  cues.push({ at: typing.end + 260, sound: 'enter' })
  promoFiles.forEach((_, index) => {
    cues.push({
      at: gobble.first + index * gobble.every + gobble.flight,
      sound: 'gulp',
    })
  })
  cues.push(
    { at: 15_150, sound: 'rumble' },
    { at: yeeetMoment, sound: 'whoosh' },
    { at: yeeetMoment, sound: 'crash' },
    { at: 18_350, sound: 'sparkle' },
    { at: touchdownMoment, sound: 'boing' },
    { at: liveStamp, sound: 'ding' },
    { at: rollbackClick, sound: 'click' },
    { at: rollbackHop + 420, sound: 'boing' },
    { at: 31_000, sound: 'pop' },
    { at: 31_400, sound: 'pop' },
    { at: 31_800, sound: 'pop' },
    { at: 32_200, sound: 'pop' },
    { at: 34_900, sound: 'sparkle' },
  )
  for (let index = 0; index < 7; index++)
    cues.push({ at: finaleCrewStart + index * 140, sound: 'pop' })
  return cues.sort((a, b) => a.at - b.at)
}
