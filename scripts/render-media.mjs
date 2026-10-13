// Renders the promo film, its soundtrack, social cards, and app icons into
// public/. Start the app first, then run:
//
//   npm run media:render -- [promo|brand|icons|all] [--origin http://localhost:3000]
//
// Requires ffmpeg and a Chromium build (set CHROME_PATH if it is not found).
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { Resvg } from '@resvg/resvg-js'
import { chromium } from 'playwright-core'
import {
  PROMO_BPM,
  PROMO_DURATION,
  PROMO_FPS,
  PROMO_HEIGHT,
  PROMO_WIDTH,
  promoCues,
  scenes,
  yeeetMoment,
} from '../src/lib/promo-timeline.ts'

const args = process.argv.slice(2)
const originFlag = args.indexOf('--origin')
const origin = new URL(
  originFlag >= 0
    ? args[originFlag + 1]
    : process.env.MEDIA_ORIGIN || 'http://localhost:3000',
)
const targets = new Set(
  args.filter(
    (arg, index) => !arg.startsWith('--') && args[index - 1] !== '--origin',
  ),
)
const all = targets.size === 0 || targets.has('all')
const publicDir = resolve('public')
const POSTER_TIME = yeeetMoment + 140

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    chromium.executablePath(),
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const found = candidates.find(
    (candidate) => candidate && existsSync(candidate),
  )
  if (!found)
    throw new Error(
      'No Chromium found. Set CHROME_PATH to a Chrome or Chromium binary.',
    )
  return found
}

function run(command, commandArgs, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} exited with ${code}`)),
    )
    if (input) input(child.stdin)
  })
}

// ---------------------------------------------------------------- soundtrack

const SAMPLE_RATE = 44_100

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const noteFrequency = (note) => {
  const names = {
    C: 0,
    'C#': 1,
    D: 2,
    'D#': 3,
    E: 4,
    F: 5,
    'F#': 6,
    G: 7,
    'G#': 8,
    A: 9,
    'A#': 10,
    B: 11,
  }
  const [, name, octave] = /^([A-G]#?)(-?\d)$/.exec(note)
  return 440 * 2 ** ((names[name] + (Number(octave) + 1) * 12 - 69) / 12)
}

function synthesizeSoundtrack() {
  const length = Math.ceil((PROMO_DURATION / 1000 + 0.5) * SAMPLE_RATE)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const random = mulberry32(0x9e3779b9)
  const beat = 60 / PROMO_BPM

  function add(start, duration, sample, { gain = 1, pan = 0 } = {}) {
    const from = Math.max(0, Math.floor(start * SAMPLE_RATE))
    const to = Math.min(length, Math.floor((start + duration) * SAMPLE_RATE))
    const leftGain = gain * Math.min(1, 1 - pan)
    const rightGain = gain * Math.min(1, 1 + pan)
    for (let index = from; index < to; index++) {
      const value = sample((index - from) / SAMPLE_RATE)
      left[index] += value * leftGain
      right[index] += value * rightGain
    }
  }
  const envelope = (t, duration, attack = 0.005, release = 0.08) =>
    Math.min(1, t / attack) * Math.min(1, Math.max(0, (duration - t) / release))
  const osc = {
    sine: (phase) => Math.sin(2 * Math.PI * phase),
    triangle: (phase) => 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5),
    square: (phase) => (phase % 1 < 0.5 ? 0.6 : -0.6),
  }
  function tone(
    start,
    duration,
    frequency,
    { wave = 'sine', gain = 0.2, attack, release, pan } = {},
  ) {
    add(
      start,
      duration,
      (t) => osc[wave](frequency * t) * envelope(t, duration, attack, release),
      { gain, pan },
    )
  }
  function noise(
    start,
    duration,
    { gain = 0.2, decay = 20, tone: brightness = 1, pan } = {},
  ) {
    let previous = 0
    add(
      start,
      duration,
      (t) => {
        const white = random() * 2 - 1
        previous += (white - previous) * brightness
        return previous * Math.exp(-t * decay)
      },
      { gain, pan },
    )
  }

  // Music: I–vi–IV–V in C, with a breakdown for the flight across the night sky.
  const chords = [
    ['C3', ['C4', 'E4', 'G4']],
    ['A2', ['A3', 'C4', 'E4']],
    ['F2', ['F3', 'A3', 'C4']],
    ['G2', ['G3', 'B3', 'D4']],
  ]
  const hook = [
    ['E5', null, 'G5', 'A5', 'G5', null, 'E5', null],
    ['D5', null, 'E5', 'G5', 'A5', null, 'G5', null],
    ['C5', null, 'E5', 'G5', 'C6', null, 'A5', null],
    ['B4', null, 'D5', 'G5', 'D5', null, 'B4', null],
  ]
  const yeeet = yeeetMoment / 1000
  const groove = (time) =>
    (time >= scenes.terminal.start / 1000 && time < yeeet - 0.05) ||
    (time >= 19.5 && time < 38)
  const bars = Math.ceil(PROMO_DURATION / 1000 / (beat * 4))
  for (let bar = 0; bar < bars; bar++) {
    const [bass, triad] = chords[bar % 4]
    const barStart = bar * beat * 4
    const inSpace = barStart >= yeeet - 0.4 && barStart < 19.5
    // Pads everywhere, softer under the groove.
    for (const note of triad)
      tone(barStart, beat * 4, noteFrequency(note), {
        wave: 'triangle',
        gain: inSpace ? 0.05 : 0.028,
        attack: 0.25,
        release: 0.6,
        pan: note === triad[0] ? -0.3 : note === triad[2] ? 0.3 : 0,
      })
    for (let step = 0; step < 8; step++) {
      const time = barStart + step * (beat / 2)
      if (time > PROMO_DURATION / 1000 - 0.6) continue
      if (inSpace) {
        // Twinkling arpeggio while the parcel crosses the sky.
        const arp = [...triad, triad[1]].map((note) => noteFrequency(note) * 4)
        tone(time, 0.5, arp[step % 4], {
          gain: 0.05,
          release: 0.45,
          pan: step % 2 ? 0.4 : -0.4,
        })
        continue
      }
      if (!groove(time)) {
        if (time >= 1 && step % 2 === 1)
          noise(time, 0.04, { gain: 0.035, decay: 90, tone: 0.9 })
        continue
      }
      const bassFrequency = noteFrequency(bass) * (step % 2 ? 2 : 1)
      tone(time, beat / 2 - 0.02, bassFrequency, {
        wave: 'triangle',
        gain: 0.17,
        release: 0.05,
      })
      noise(time, 0.05, {
        gain: step % 2 ? 0.05 : 0.035,
        decay: 80,
        tone: 0.95,
        pan: 0.2,
      })
      if (step % 4 === 0) {
        // Kick: a fast downward sine sweep.
        add(
          time,
          0.22,
          (t) =>
            Math.sin(
              2 * Math.PI * (52 * t + (90 * (1 - Math.exp(-t * 28))) / 28),
            ) * Math.exp(-t * 14),
          { gain: 0.5 },
        )
      }
      if (step % 4 === 2)
        noise(time, 0.18, { gain: 0.16, decay: 18, tone: 0.55 })
      if (step % 2 === 1)
        for (const note of triad)
          tone(time, 0.11, noteFrequency(note) * 2, {
            wave: 'square',
            gain: 0.022,
            release: 0.06,
          })
      const melodyOn = time >= 19.5 && time < 38
      const note = hook[bar % 4][step]
      if (melodyOn && note)
        tone(time, beat / 2 - 0.03, noteFrequency(note), {
          wave: 'square',
          gain: 0.045,
          release: 0.07,
          pan: 0.15,
        })
    }
  }
  // Build-up snare roll into the yeeet.
  for (let time = yeeet - 1.0; time < yeeet - 0.04;) {
    const progress = 1 - (yeeet - time) / 1.0
    noise(time, 0.06, { gain: 0.06 + progress * 0.12, decay: 40, tone: 0.6 })
    time += 0.125 - progress * 0.07
  }
  // Finale: a big ringing chord.
  for (const note of ['C3', 'G3', 'C4', 'E4', 'G4', 'C5'])
    tone(38, 2, noteFrequency(note), {
      wave: 'triangle',
      gain: 0.06,
      attack: 0.01,
      release: 1.9,
    })

  // Sound effects from the shared cue sheet.
  const sfx = {
    type: (at) => {
      noise(at, 0.018, { gain: 0.16, decay: 160, tone: 0.98, pan: 0.1 })
      tone(at, 0.012, 2400 + random() * 400, { gain: 0.04 })
    },
    enter: (at) => {
      tone(at, 0.07, 170, { gain: 0.3, release: 0.05 })
      noise(at, 0.03, { gain: 0.15, decay: 90, tone: 0.9 })
    },
    gulp: (at) =>
      add(
        at,
        0.16,
        (t) =>
          Math.sin(2 * Math.PI * (300 * t + (700 * t * t) / 0.32)) *
          Math.exp(-t * 18),
        { gain: 0.32 },
      ),
    rumble: (at) =>
      add(
        at,
        1.15,
        (t) =>
          (Math.sin(2 * Math.PI * 48 * t) * 0.8 + (random() * 2 - 1) * 0.25) *
          Math.min(1, t / 1.1) *
          (1 + Math.sin(2 * Math.PI * 9 * t)) *
          0.5,
        { gain: 0.32 },
      ),
    whoosh: (at) => {
      let previous = 0
      add(
        at,
        0.9,
        (t) => {
          const cutoff = 0.02 + 0.5 * Math.min(1, t / 0.35)
          previous += (random() * 2 - 1 - previous) * cutoff
          return previous * Math.sin(Math.PI * Math.min(1, t / 0.9))
        },
        { gain: 0.55 },
      )
    },
    crash: (at) => noise(at, 1.8, { gain: 0.18, decay: 2.4, tone: 0.97 }),
    boing: (at) =>
      add(
        at,
        0.55,
        (t) => {
          const frequency =
            180 +
            t * 260 +
            70 * Math.sin(2 * Math.PI * 14 * t) * Math.exp(-t * 5)
          return Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 6)
        },
        { gain: 0.32 },
      ),
    ding: (at) => {
      tone(at, 0.9, noteFrequency('E6'), { gain: 0.14, release: 0.85 })
      tone(at + 0.09, 1.1, noteFrequency('A6'), { gain: 0.12, release: 1.05 })
    },
    click: (at) => {
      noise(at, 0.012, { gain: 0.2, decay: 200, tone: 0.99 })
      tone(at, 0.03, 1100, { gain: 0.08 })
    },
    pop: (at) =>
      add(
        at,
        0.09,
        (t) =>
          Math.sin(2 * Math.PI * (480 * t + 3200 * t * t)) * Math.exp(-t * 30),
        { gain: 0.26 },
      ),
    sparkle: (at) =>
      ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((note, index) =>
        tone(at + index * 0.06, 0.35, noteFrequency(note), {
          gain: 0.05,
          release: 0.3,
          pan: index % 2 ? 0.5 : -0.5,
        }),
      ),
  }
  for (const cue of promoCues()) sfx[cue.sound](cue.at / 1000)

  // Fade out, soft-limit, and encode as 16-bit stereo PCM.
  const fadeFrom = (PROMO_DURATION / 1000 - 1.2) * SAMPLE_RATE
  let peak = 0
  for (let index = 0; index < length; index++) {
    const fade =
      index > fadeFrom
        ? Math.max(0, 1 - (index - fadeFrom) / (1.2 * SAMPLE_RATE))
        : 1
    left[index] = Math.tanh(left[index] * 1.1) * fade
    right[index] = Math.tanh(right[index] * 1.1) * fade
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]))
  }
  const scale = peak > 0 ? 0.89 / peak : 1
  const wav = Buffer.alloc(44 + length * 4)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + length * 4, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE * 4, 28)
  wav.writeUInt16LE(4, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(length * 4, 40)
  for (let index = 0; index < length; index++) {
    wav.writeInt16LE(Math.round(left[index] * scale * 32767), 44 + index * 4)
    wav.writeInt16LE(Math.round(right[index] * scale * 32767), 46 + index * 4)
  }
  return wav
}

// ------------------------------------------------------------------- renders

async function renderPromo(browser, workDir) {
  const promoDir = join(publicDir, 'promo')
  mkdirSync(promoDir, { recursive: true })
  const audioPath = join(workDir, 'soundtrack.wav')
  writeFileSync(audioPath, synthesizeSoundtrack())
  console.log('Synthesized soundtrack.')

  const page = await browser.newPage({
    viewport: { width: PROMO_WIDTH, height: PROMO_HEIGHT },
  })
  await page.goto(new URL('/promo?capture=1', origin).href, {
    waitUntil: 'networkidle',
  })
  await page.waitForFunction(() => window.__promo)
  await page.evaluate(() => document.fonts.ready)

  const frames = Math.round((PROMO_DURATION / 1000) * PROMO_FPS)
  // Encode beside the work files so a failed run never leaves a partial video.
  const output = join(workDir, 'yeeet-promo.mp4')
  let failure
  await run(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(PROMO_FPS),
      '-i',
      '-',
      '-i',
      audioPath,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-tune',
      'animation',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-g',
      String(PROMO_FPS * 2),
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-shortest',
      output,
    ],
    (stdin) => {
      ;(async () => {
        for (let frame = 0; frame < frames; frame++) {
          await page.evaluate(
            (ms) => window.__promo.seek(ms),
            (frame * 1000) / PROMO_FPS,
          )
          const image = await page.screenshot({ type: 'png' })
          if (!stdin.write(image))
            await new Promise((done) => stdin.once('drain', done))
          if (frame % PROMO_FPS === 0)
            process.stdout.write(`\rFrames ${frame}/${frames}`)
        }
        stdin.end()
        process.stdout.write(`\rFrames ${frames}/${frames}\n`)
      })().catch((error) => {
        failure = error
        stdin.destroy()
      })
    },
  )
  if (failure) throw failure
  copyFileSync(output, join(promoDir, 'yeeet-promo.mp4'))

  await page.evaluate((ms) => window.__promo.seek(ms), POSTER_TIME)
  writeFileSync(
    join(promoDir, 'yeeet-promo-poster.jpg'),
    await page.screenshot({ type: 'jpeg', quality: 86 }),
  )
  const ogFrame = join(workDir, 'og-promo.png')
  writeFileSync(ogFrame, await page.screenshot({ type: 'png' }))
  await run('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    ogFrame,
    '-vf',
    'scale=1200:-1,crop=1200:630',
    join(publicDir, 'og', 'promo.png'),
  ])
  const audioOutput = join(workDir, 'yeeet-promo-audio.m4a')
  await run('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    audioPath,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    audioOutput,
  ])
  copyFileSync(audioOutput, join(promoDir, 'yeeet-promo-audio.m4a'))
  await page.close()
  console.log('Rendered public/promo and public/og/promo.png.')
}

async function renderBrandCards(browser) {
  mkdirSync(join(publicDir, 'og'), { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  for (const [asset, file] of [
    ['og-yeeet', 'yeeet.png'],
    ['og-yeeetlings', 'yeeetlings.png'],
    ['og-docs', 'docs.png'],
  ]) {
    await page.goto(new URL(`/brand?asset=${asset}`, origin).href, {
      waitUntil: 'networkidle',
    })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(publicDir, 'og', file) })
    console.log(`Rendered public/og/${file}.`)
  }
  await context.close()
}

function renderIcons() {
  const svg = readFileSync(join(publicDir, 'favicon.svg'))
  for (const [file, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
      .render()
      .asPng()
    writeFileSync(join(publicDir, file), png)
    console.log(`Rendered public/${file}.`)
  }
}

if (all || targets.has('icons')) renderIcons()
if (all || targets.has('promo') || targets.has('brand')) {
  const workDir = mkdtempSync(join(tmpdir(), 'yeeet-media-'))
  const browser = await chromium.launch({ executablePath: chromePath() })
  try {
    if (all || targets.has('brand')) await renderBrandCards(browser)
    if (all || targets.has('promo')) await renderPromo(browser, workDir)
  } finally {
    await browser.close()
    rmSync(workDir, { recursive: true, force: true })
  }
}
