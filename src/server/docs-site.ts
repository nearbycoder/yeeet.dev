import { createHash } from 'node:crypto'
import {
  controlPlaneUrl,
  docsHost,
  docsUrl,
  siteDomain,
} from './platform-config'

const DOCS_CSS = String.raw`
:root {
  color-scheme: light;
  --paper: #f3efe6;
  --paper-bright: #fffdf7;
  --ink: #171714;
  --muted: #6f6a61;
  --line: #d4cdc0;
  --coral: #f04d2f;
  --coral-dark: #bd321b;
  --lime: #d7f544;
  --night: #161713;
  --night-soft: #24251f;
  --focus: #2454ff;
  --header-bg: rgba(243, 239, 230, 0.94);
  --grid: rgba(23, 23, 20, 0.04);
  --body-copy: #514d46;
  --hover-bg: rgba(255, 253, 247, 0.8);
  --card-wash: rgba(255, 253, 247, 0.74);
  --inline-bg: #ebe6dc;
  --inline-border: #d6cfc3;
  --inline-ink: #3f3a34;
  --callout-bg: #f9ffd8;
  --callout-ink: #44451d;
  --table-head: #e9e3d8;
  --table-head-ink: #615c54;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "SFMono-Regular", Consolas, "Liberation Mono", ui-monospace, monospace;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --paper: #171714;
  --paper-bright: #22221e;
  --ink: #f4f0e7;
  --muted: #b9b3a9;
  --line: #4b4942;
  --coral: #ff694c;
  --coral-dark: #ff8b73;
  --focus: #9cb5ff;
  --header-bg: rgba(23, 23, 20, 0.94);
  --grid: rgba(244, 240, 231, 0.055);
  --body-copy: #cbc5bb;
  --hover-bg: rgba(255, 255, 255, 0.07);
  --card-wash: rgba(255, 255, 255, 0.035);
  --inline-bg: #302f29;
  --inline-border: #55524a;
  --inline-ink: #eee8dd;
  --callout-bg: #2b311c;
  --callout-ink: #dce4ad;
  --table-head: #2b2a25;
  --table-head-ink: #c8c1b7;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 96px;
  overflow-x: hidden;
}

body {
  margin: 0;
  min-width: 280px;
  overflow-x: hidden;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.65 var(--sans);
  -webkit-font-smoothing: antialiased;
}

button,
a {
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(240, 77, 47, 0.18);
}

button {
  color: inherit;
  font: inherit;
}

a {
  color: inherit;
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
}

a:hover {
  color: var(--coral-dark);
}

a:focus-visible,
button:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.skip-link {
  position: fixed;
  z-index: 100;
  top: 12px;
  left: 12px;
  transform: translateY(-180%);
  border: 2px solid var(--ink);
  border-radius: 4px;
  padding: 10px 14px;
  background: var(--paper-bright);
  font-weight: 800;
}

.skip-link:focus {
  transform: translateY(0);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.site-header {
  position: sticky;
  z-index: 20;
  top: 0;
  border-bottom: 1px solid var(--line);
  background: var(--header-bg);
  backdrop-filter: blur(18px);
}

.header-inner {
  display: flex;
  width: min(100% - 40px, 1220px);
  min-height: 72px;
  margin: 0 auto;
  align-items: center;
  gap: 24px;
}

.brand {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 2px solid var(--ink);
  border-radius: 10px;
  background: var(--coral);
  box-shadow: 3px 3px 0 var(--ink);
  color: var(--ink);
  font-weight: 950;
  letter-spacing: -0.08em;
}

.brand-name {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.brand-tag {
  border-left: 1px solid var(--line);
  padding-left: 12px;
  color: var(--muted);
  font: 12px/1 var(--mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-nav {
  display: flex;
  min-width: 0;
  margin-left: auto;
  align-items: center;
  gap: 6px;
}

.header-nav a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border-radius: 4px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 750;
  text-decoration: none;
}

.header-nav a:hover {
  background: var(--hover-bg);
  color: var(--ink);
}

.theme-toggle {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  padding: 0;
  color: var(--ink);
  background: var(--paper-bright);
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--ink);
  background: var(--lime);
  color: #171714;
}

.theme-icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.theme-icon-sun,
html[data-theme="dark"] .theme-icon-moon {
  display: none;
}

html[data-theme="dark"] .theme-icon-sun {
  display: block;
}

.header-nav .launch-link {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper-bright);
}

.header-nav .launch-link:hover {
  background: var(--coral);
  color: var(--ink);
}

.hero {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--line);
}

.hero::before {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 32px 32px;
  content: "";
  mask-image: linear-gradient(to bottom, #000, transparent 82%);
  pointer-events: none;
}

.hero-inner {
  position: relative;
  display: grid;
  width: min(100% - 40px, 1220px);
  margin: 0 auto;
  padding: 92px 0 84px;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 0.78fr);
  align-items: center;
  gap: clamp(48px, 8vw, 112px);
}

.eyebrow,
.section-label {
  color: var(--coral-dark);
  font: 750 12px/1.25 var(--mono);
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.eyebrow::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral);
  box-shadow: 0 0 0 4px rgba(240, 77, 47, 0.13);
  content: "";
}

h1,
h2,
h3 {
  margin: 0;
  line-height: 1.04;
  letter-spacing: -0.055em;
  text-wrap: balance;
}

h1 {
  max-width: 790px;
  margin-top: 24px;
  font-size: clamp(54px, 7.4vw, 100px);
  font-weight: 950;
}

.hero h1 span {
  color: var(--coral);
}

.hero-lede {
  max-width: 670px;
  margin: 26px 0 0;
  color: var(--body-copy);
  font-size: clamp(18px, 2vw, 22px);
  line-height: 1.5;
  text-wrap: pretty;
}

.hero-actions {
  display: flex;
  margin-top: 34px;
  flex-wrap: wrap;
  gap: 12px;
}

.button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ink);
  border-radius: 4px;
  padding: 0 18px;
  box-shadow: 3px 3px 0 var(--ink);
  font-size: 14px;
  font-weight: 850;
  text-decoration: none;
}

.button-primary {
  background: var(--coral);
  color: var(--ink);
}

.button-secondary {
  background: var(--paper-bright);
}

.button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
  color: var(--ink);
}

.quick-card {
  overflow: hidden;
  border: 1px solid #3a3b33;
  border-radius: 8px;
  background: var(--night);
  box-shadow: 10px 10px 0 var(--lime);
  color: #f7f4eb;
}

.quick-card-head {
  display: flex;
  min-height: 48px;
  align-items: center;
  border-bottom: 1px solid #3a3b33;
  padding: 0 18px;
  color: #aaa99f;
  font: 12px/1 var(--mono);
}

.window-dots {
  display: inline-flex;
  margin-right: 12px;
  gap: 5px;
}

.window-dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5b5c52;
}

.quick-card ol {
  margin: 0;
  padding: 12px 0;
  list-style: none;
  counter-reset: quick;
}

.quick-card li {
  display: grid;
  min-width: 0;
  padding: 16px 18px;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  counter-increment: quick;
}

.quick-card li::before {
  color: var(--lime);
  content: counter(quick, decimal-leading-zero);
  font: 12px/1.75 var(--mono);
}

.quick-card code {
  overflow-wrap: anywhere;
  color: #fff;
  font: 14px/1.75 var(--mono);
}

.quick-result {
  display: flex;
  min-width: 0;
  align-items: center;
  border-top: 1px solid #3a3b33;
  padding: 16px 18px;
  gap: 10px;
  color: #cbc9bd;
  font: 12px/1.5 var(--mono);
  overflow-wrap: anywhere;
}

.quick-result strong {
  color: var(--lime);
}

.docs-shell {
  display: grid;
  width: min(100% - 40px, 1220px);
  margin: 0 auto;
  padding: 48px 0 96px;
  grid-template-columns: 230px minmax(0, 760px);
  justify-content: space-between;
  gap: clamp(48px, 8vw, 110px);
}

.toc {
  position: sticky;
  top: 104px;
  align-self: start;
}

.toc p {
  margin: 0 0 13px;
  color: var(--muted);
  font: 700 12px/1 var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.toc a {
  display: flex;
  min-height: 40px;
  align-items: center;
  border-left: 2px solid var(--line);
  padding: 7px 12px;
  color: var(--body-copy);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
}

.toc a:hover,
.toc a:focus-visible {
  border-left-color: var(--coral);
  color: var(--ink);
  background: var(--hover-bg);
}

.toc-machine {
  margin-top: 24px;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 14px;
  background: var(--paper-bright);
  color: var(--muted);
  font: 12px/1.55 var(--mono);
}

.toc-machine a {
  display: inline;
  min-height: 0;
  border: 0;
  padding: 0;
  color: var(--coral-dark);
  text-decoration: underline;
}

.docs-content {
  min-width: 0;
}

.docs-section {
  padding: 54px 0;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: 88px;
}

.docs-section:first-child {
  padding-top: 0;
}

.docs-section:last-child {
  border-bottom: 0;
}

.docs-section h2 {
  margin-top: 14px;
  font-size: clamp(34px, 4vw, 48px);
}

.docs-section h3 {
  margin-top: 36px;
  font-size: 24px;
  letter-spacing: -0.035em;
}

.docs-section > p,
.docs-section > div > p,
.docs-section li {
  color: var(--body-copy);
  text-wrap: pretty;
}

.docs-section > p {
  max-width: 68ch;
  margin: 18px 0 0;
}

.step-list {
  display: grid;
  margin: 28px 0 0;
  padding: 0;
  gap: 16px;
  list-style: none;
  counter-reset: steps;
}

.step-list > li {
  display: grid;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 20px;
  background: var(--card-wash);
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 16px;
  counter-increment: steps;
}

.step-list > li::before {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: var(--ink);
  color: var(--lime);
  content: counter(steps);
  font: 750 13px/1 var(--mono);
}

.step-list h3 {
  margin: 2px 0 6px;
  font-size: 18px;
  letter-spacing: -0.025em;
}

.step-list p {
  margin: 0 0 14px;
}

.code-block {
  position: relative;
  min-width: 0;
  margin: 18px 0 0;
  overflow: hidden;
  border: 1px solid #3a3b33;
  border-radius: 7px;
  background: var(--night);
  color: #f4f1e8;
}

.code-block pre {
  margin: 0;
  overflow-x: auto;
  padding: 20px 58px 20px 20px;
  scrollbar-color: #55564d var(--night);
}

.code-block code {
  color: inherit;
  font: 14px/1.75 var(--mono);
  white-space: pre;
}

.copy-button {
  position: absolute;
  top: 9px;
  right: 9px;
  min-width: 44px;
  min-height: 36px;
  border: 1px solid #595b50;
  border-radius: 4px;
  padding: 0 10px;
  background: var(--night-soft);
  color: #dad8cf;
  cursor: pointer;
  font: 700 12px/1 var(--mono);
}

.copy-button:hover {
  border-color: var(--lime);
  color: var(--lime);
}

.callout {
  margin-top: 24px;
  border: 1px solid #a7b83b;
  border-left: 5px solid var(--lime);
  border-radius: 5px;
  padding: 17px 18px;
  background: var(--callout-bg);
  color: var(--callout-ink);
}

.callout strong {
  color: var(--ink);
}

.callout p {
  margin: 0;
}

.workflow-grid,
.agent-grid {
  display: grid;
  margin-top: 28px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.workflow-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 20px;
  background: var(--paper-bright);
}

.workflow-card h3 {
  margin: 0;
  font-size: 19px;
  letter-spacing: -0.025em;
}

.workflow-card p {
  margin: 9px 0 0;
  font-size: 14px;
  line-height: 1.55;
}

.workflow-card code,
.inline-code {
  border: 1px solid var(--inline-border);
  border-radius: 3px;
  padding: 0.15em 0.35em;
  background: var(--inline-bg);
  color: var(--inline-ink);
  font: 0.88em/1.3 var(--mono);
  overflow-wrap: anywhere;
}

.command-table-wrap {
  margin-top: 26px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper-bright);
}

table {
  width: 100%;
  min-width: 610px;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

th {
  background: var(--table-head);
  color: var(--table-head-ink);
  font: 750 12px/1.3 var(--mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

tr:last-child td {
  border-bottom: 0;
}

td:first-child {
  color: var(--ink);
  font: 13px/1.55 var(--mono);
  white-space: nowrap;
}

.agent-panel {
  overflow: hidden;
  margin-top: 28px;
  border: 1px solid #3a3b33;
  border-radius: 8px;
  background: var(--night);
  color: #f4f1e8;
}

.agent-panel-content {
  padding: 28px;
}

.agent-panel h3 {
  margin: 0;
  color: #fff;
  font-size: 26px;
}

.agent-panel p {
  max-width: 63ch;
  margin: 12px 0 0;
  color: #bbb9af;
}

.agent-links {
  display: grid;
  border-top: 1px solid #3a3b33;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.agent-links a {
  min-width: 0;
  padding: 18px;
  border-right: 1px solid #3a3b33;
  color: var(--lime);
  font: 700 12px/1.5 var(--mono);
  overflow-wrap: anywhere;
}

.agent-links a:last-child {
  border-right: 0;
}

.agent-links a:hover {
  background: var(--night-soft);
  color: #fff;
}

.plain-list {
  margin: 22px 0 0;
  padding-left: 22px;
}

.plain-list li + li {
  margin-top: 10px;
}

.footer {
  border-top: 1px solid var(--line);
}

.footer-inner {
  display: flex;
  width: min(100% - 40px, 1220px);
  min-height: 118px;
  margin: 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.footer p {
  margin: 0;
  color: var(--muted);
  font: 12px/1.5 var(--mono);
  text-align: right;
}

.not-found {
  width: min(100% - 40px, 720px);
  margin: 0 auto;
  padding: 15vh 0;
}

.not-found h1 {
  margin: 20px 0;
  font-size: clamp(48px, 9vw, 86px);
}

.not-found > p:last-child {
  margin-top: 30px;
}

.not-found-theme {
  position: fixed;
  z-index: 20;
  top: max(18px, env(safe-area-inset-top));
  right: max(18px, env(safe-area-inset-right));
}

@media (max-width: 900px) {
  .hero-inner {
    padding: 70px 0;
    grid-template-columns: 1fr;
    gap: 48px;
  }

  .quick-card {
    width: min(100%, 620px);
  }

  .docs-shell {
    display: block;
    padding-top: 26px;
  }

  .toc {
    position: static;
    display: flex;
    margin: 0 -20px 42px;
    overflow-x: auto;
    padding: 0 20px 12px;
    gap: 6px;
    scrollbar-width: thin;
  }

  .toc p,
  .toc-machine {
    display: none;
  }

  .toc a {
    flex: 0 0 auto;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 14px;
    background: var(--card-wash);
  }

  .toc a:hover,
  .toc a:focus-visible {
    border-color: var(--coral);
  }
}

@media (max-width: 650px) {
  html {
    scroll-padding-top: 76px;
  }

  .header-inner {
    width: calc(100% - 28px);
    min-height: 64px;
  }

  .brand-tag,
  .header-nav .api-link,
  .header-nav .llm-link {
    display: none;
  }

  .header-nav {
    gap: 2px;
  }

  .header-nav a {
    padding: 0 10px;
    font-size: 13px;
  }

  .hero-inner,
  .docs-shell,
  .footer-inner {
    width: calc(100% - 32px);
  }

  .hero-inner {
    padding: 56px 0 62px;
  }

  h1 {
    font-size: clamp(47px, 15vw, 68px);
  }

  .hero-lede {
    font-size: 18px;
  }

  .hero-actions {
    display: grid;
  }

  .button {
    width: 100%;
  }

  .quick-card {
    box-shadow: 6px 6px 0 var(--lime);
  }

  .docs-section {
    padding: 46px 0;
    scroll-margin-top: 74px;
  }

  .docs-section h2 {
    font-size: 36px;
  }

  .step-list > li {
    display: block;
  }

  .step-list > li::before {
    margin-bottom: 14px;
  }

  .workflow-grid,
  .agent-grid {
    grid-template-columns: 1fr;
  }

  .code-block pre {
    padding: 56px 16px 18px;
  }

  .copy-button {
    top: 10px;
    right: 10px;
  }

  .agent-panel-content {
    padding: 22px;
  }

  .agent-links {
    grid-template-columns: 1fr;
  }

  .agent-links a {
    min-height: 52px;
    border-right: 0;
    border-bottom: 1px solid #3a3b33;
  }

  .agent-links a:last-child {
    border-bottom: 0;
  }

  .footer-inner {
    padding: 30px 0 calc(30px + env(safe-area-inset-bottom));
    flex-direction: column;
    align-items: flex-start;
  }

  .footer p {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`

const DOCS_JS = String.raw`
const themeStorageKey = 'yeeet-theme'

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#171714' : '#f3efe6',
  )
  if (persist) localStorage.setItem(themeStorageKey, theme)
}

try {
  const storedTheme = localStorage.getItem(themeStorageKey)
  const colorScheme = matchMedia('(prefers-color-scheme: dark)')
  applyTheme(
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : colorScheme.matches
        ? 'dark'
        : 'light',
  )
  colorScheme.addEventListener('change', (event) => {
    if (!localStorage.getItem(themeStorageKey)) {
      applyTheme(event.matches ? 'dark' : 'light')
    }
  })
} catch {}

document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return
  const themeButton = event.target.closest('[data-theme-toggle]')
  if (themeButton) {
    const nextTheme =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyTheme(nextTheme, true)
    return
  }

  const button = event.target.closest('[data-copy]')
  if (!button) return
  const source = document.getElementById(button.dataset.copy)
  const status = document.getElementById('copy-status')
  if (!source) return

  const original = button.textContent
  try {
    await navigator.clipboard.writeText(source.textContent.trim())
    button.textContent = 'Copied'
    status.textContent = 'Command copied to clipboard.'
  } catch {
    button.textContent = 'Select text'
    status.textContent = 'Copy failed. The command text is selected.'
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(source)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  window.setTimeout(() => {
    button.textContent = original
    status.textContent = ''
  }, 1800)
})
`

function cspHash(value: string) {
  return `'sha256-${createHash('sha256').update(value).digest('base64')}'`
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'img-src data:',
  "object-src 'none'",
  `script-src ${cspHash(DOCS_JS)}`,
  `style-src ${cspHash(DOCS_CSS)}`,
].join('; ')

const LLMS_TXT = String.raw`# Yeeet CLI documentation

> Yeeet publishes a file or folder as an atomic static deployment with managed HTTPS and CDN caching. A site receives either a generated or chosen https://<name>.site.yeeet.dev URL.

Canonical human docs: https://docs.yeeet.dev/
Complete plain-text docs: https://docs.yeeet.dev/llms-full.txt
OpenAPI: https://docs.yeeet.dev/openapi.json
Dashboard: https://yeeet.dev/dashboard
Source and self-hosting guide: https://github.com/nearbycoder/yeeet.dev

Yeeet is for developers shipping static builds, teams reviewing immutable previews, agents and CI that need deterministic JSON, and operators who want a compact self-hosted deployment plane. It serves already-built files; it does not execute untrusted builds.

## Fastest path

    npm install --global @yeeet.dev/cli
    yeeet login
    yeeet deploy ./dist

The default deployment uses a generated readable subdomain and SPA fallback. Add --name <slug> for a stable URL or --static for strict file-only routing.

## Agent and CI path

Create an API key in https://yeeet.dev/dashboard, keep it out of logs and source control, then run:

    export YEEET_TOKEN="yeeet_…"
    yeeet deploy ./dist --json

Exit codes are 0 for success, 2 when authentication is required, and 1 for validation, upload, or network failure. Successful JSON includes status, url, versionUrl, deployment, site, spaFallback, protected, shareUrl, files, and bytes.

## Core commands

- yeeet login: authenticate through the browser with a one-time device code.
- yeeet whoami --json: verify the current credential.
- yeeet deploy [path] --json: atomically publish a file or folder. Path defaults to the current directory.
- yeeet deploy [path] --dry-run --json: return an exact file and byte diff without creating a deployment.
- yeeet deploy ./dist --name <slug>: update a stable named site.
- yeeet sites --json: list sites.
- yeeet versions <site> --json: list immutable releases and preview URLs.
- yeeet rollback <site> [version] --json: activate a prior ready release. Omit version to choose the previous release.
- yeeet deploy ./dist --name <site> --channel staging: update a mutable no-index channel without moving production.
- yeeet channel list <site> --json: list mutable deployment channels.
- yeeet channel set <site> <channel> <version> --json: point a channel at a ready version.
- yeeet channel remove <site> <channel> --json: remove an alias without deleting its version.
- yeeet version remove <site> <version> --yes --json: delete one immutable version.
- yeeet remove <site> --yes --json: delete a site and every version.
- yeeet access protect <site> <version> --password <password> --json: protect an existing version.
- yeeet share <site> [version] --json: return a one-click private share URL.
- yeeet access rotate-link <site> <version> --json: revoke the previous link and issue another.
- yeeet access public <site> <version> --json: remove protection.
- yeeet domain add <site> <hostname> --json: attach a custom hostname and return required DNS records.
- yeeet domain list <site> --json: inspect DNS and TLS status.
- yeeet init [name]: create .yeeet.json for repeatable deploy defaults.
- GitHub Action: use nearbycoder/yeeet.dev@main to deploy a directory or maintain a per-PR preview and comment. Use cleanup mode when the PR closes.

## Invariants useful to agents

- Uploads are atomic: the live pointer changes only after every object completes.
- Clients send SHA-256 file digests. Unchanged content owned by the same account is copied within storage and omitted from uploadUrls.
- Version preview URLs are immutable; live aliases update at the edge in about 10 seconds.
- SPA fallback defaults to true and only handles navigation-like paths, not missing assets.
- Root _headers and _redirects files are validated and versioned with the deployment. They are never served as site assets.
- Public sites receive a deterministic 1200x630 Yeeetling social card at /_yeeet/og.png unless their HTML supplies og:image or twitter:image.
- --json suppresses decorative output. Parse stdout as one JSON object.
- CLI creates use a random idempotency key and retry transient failures. Agents may set --idempotency-key explicitly; the API also accepts Idempotency-Key.
- Version identifiers accept an unambiguous prefix of at least 8 characters where supported.
- Passwords are 8–128 characters. YEEET_DEPLOY_PASSWORD avoids a password in shell history.
- Never log or commit YEEET_TOKEN.
`

const LLMS_FULL_TXT = String.raw`# Yeeet CLI Guide

Yeeet turns a file or build folder into a globally cached HTTPS site. Deploys are atomic, every ready release has an immutable preview URL, and a named site can move between releases without uploading the files again.

CLI and browser deploys hash files with SHA-256. When a ready release owned by the same account already contains identical bytes, the server copies that object into the new immutable release inside storage and asks the client to upload only changed files.

Human documentation: https://docs.yeeet.dev/
OpenAPI contract: https://docs.yeeet.dev/openapi.json
MIT-licensed source and self-hosting guide: https://github.com/nearbycoder/yeeet.dev

Yeeet is designed for developers, review teams, agents, CI pipelines, and self-hosting platform operators. It accepts already-built static files and deliberately does not execute user-supplied builds.

## Requirements

- Node.js 20 or newer
- A Yeeet account. Registration is invitation-only.
- A static file or build directory such as dist, build, out, or public

## Install and log in

    npm install --global @yeeet.dev/cli
    yeeet login

The login command opens a browser and waits for a one-time device authorization. The CLI stores the resulting session locally. Use yeeet whoami to confirm it and yeeet logout to remove it.

For CI or agents, create an API key in the Yeeet dashboard and pass it through the environment:

    export YEEET_TOKEN="yeeet_…"
    yeeet whoami --json

Never put YEEET_TOKEN in source control, command output, screenshots, or prompts.

## GitHub Actions and pull request previews

Yeeet ships a JavaScript action at nearbycoder/yeeet.dev@main. Give it a Yeeet API key, a build directory, and a stable site base name. On pull_request events it deploys to <site>-pr-<number>, updates one PR comment with the live and immutable URLs, and removes the preview when called with mode cleanup. GitHub does not expose repository secrets to untrusted fork pull requests; keep that protection in place.

## Deploy

Deploy the current directory and let Yeeet create a readable random name:

    yeeet deploy

Deploy a build folder:

    yeeet deploy ./dist

Choose a stable site name. Later deploys to the same name create new versions and atomically update its live alias:

    yeeet deploy ./dist --name comet

The live URL is https://comet.site.yeeet.dev. Each release also receives an immutable URL in the form https://v-<deployment-id>.site.yeeet.dev.

Deploy to a mutable channel without changing production:

    yeeet deploy ./dist --name comet --channel staging

That updates https://comet--staging.site.yeeet.dev. Channel aliases are no-index and use short edge revalidation. Point a channel at an existing version with yeeet channel set comet staging <version>, or remove only the alias with yeeet channel remove comet staging.

SPA fallback is enabled by default. A refresh at /settings/profile serves index.html when that path has no file, while a missing asset such as /assets/app.js remains a 404. Use strict static routing when appropriate:

    yeeet deploy ./public --static

## Headers, redirects, and rewrites

Add a _headers file to the root of the deployed folder:

    /assets/*
      Cache-Control: public, max-age=604800
      X-Frame-Options: DENY

Add a _redirects file for redirects or internal rewrites:

    /old-docs/:page /guides/:page 308
    /app/* /index.html 200

Rules support named parameters and one wildcard. Status 200 is an internal rewrite; 301, 302, 303, 307, and 308 are redirects. Rules are immutable deployment metadata, so rollback restores them with the files. Yeeet reserves transport, content-type, privacy, and immutable-version crawler headers.

Use JSON output for scripts:

    yeeet deploy ./dist --name comet --json

Preview the exact operation without creating a database row, changing an alias, or touching storage:

    yeeet deploy ./dist --name comet --dry-run --json

The response separates added, changed, removed, and unchanged paths and includes uploadBytes. Real CLI creates automatically retry with one idempotency key. Supply --idempotency-key <key> when an external workflow needs to resume the same exact request; using that key with different input returns a conflict.

A successful response resembles:

    {
      "status": "ready",
      "url": "https://comet.site.yeeet.dev",
      "versionUrl": "https://v-52eabb5f36c842468422893db39607d3.site.yeeet.dev",
      "deployment": "52eabb5f-36c8-4246-8422-893db39607d3",
      "site": "comet",
      "spaFallback": true,
      "protected": false,
      "shareUrl": null,
      "files": 42,
      "bytes": 2457600
    }

The exit code is 0 on success, 2 when authentication is required, and 1 for validation, upload, or network errors.

## Repeatable project configuration

Create .yeeet.json in the current directory:

    yeeet init comet

Then a deploy can be only:

    yeeet deploy ./dist

Run yeeet init without a name to preserve generated subdomains. Set spaFallback to false in .yeeet.json for strict static routing. A .yeeetignore file accepts glob patterns. Yeeet always excludes .git, node_modules, .DS_Store, and .yeeetignore itself.

## Versions and rollback

List all sites and immutable releases:

    yeeet sites --json
    yeeet versions comet --json

Activate a specific prior release by full ID or an unambiguous prefix of at least 8 characters:

    yeeet rollback comet 52eabb5f

Omit the version to select the previous ready release:

    yeeet rollback comet

Delete one version or the entire site. These commands require --yes because stored objects are permanently removed:

    yeeet version remove comet 52eabb5f --yes
    yeeet remove comet --yes

If a live version is deleted, Yeeet activates the newest remaining ready version. If no ready version remains, the site has no live release.

## Private sharing

Protect a new deployment without putting the password directly in shell history:

    export YEEET_DEPLOY_PASSWORD="a long private password"
    yeeet deploy ./dist --name review

Retrieve a one-click share link. The recipient needs neither a Yeeet account nor the password:

    yeeet share review

Change access for an existing version:

    yeeet access protect review <version> --password "a new password"
    yeeet access rotate-link review <version>
    yeeet access public review <version>

Rotating a link revokes the previous signed link and viewer cookies. Passwords must contain 8–128 characters.

## Custom domains

Attach a hostname you control:

    yeeet domain add comet www.example.com --json

The response contains every routing and ownership-verification DNS record. Add each record exactly at your DNS provider, then inspect status:

    yeeet domain list comet --json
    yeeet domain refresh comet www.example.com --json

Yeeet and Railway manage certificate issuance after DNS verification. Remove a mapping with:

    yeeet domain remove comet www.example.com

## Complete command summary

    yeeet login
    yeeet logout
    yeeet whoami [--json]
    yeeet sites [--json]
    yeeet deploy|up [path] [--name <slug>] [--channel <name>] [--dry-run] [--idempotency-key <key>] [--spa|--static] [--password <password>] [--json]
    yeeet versions <site> [--json]
    yeeet rollback <site> [version] [--json]
    yeeet channel list <site> [--json]
    yeeet channel set <site> <channel> <version> [--json]
    yeeet channel remove|rm <site> <channel> [--json]
    yeeet version remove <site> <version> --yes [--json]
    yeeet remove|rm <site> --yes [--json]
    yeeet share <site> [version] [--json]
    yeeet access protect <site> <version> --password <password> [--json]
    yeeet access public <site> <version> [--json]
    yeeet access rotate-link <site> <version> [--json]
    yeeet domain add <site> <hostname> [--json]
    yeeet domain list <site> [--json]
    yeeet domain refresh <site> <domain> [--json]
    yeeet domain remove|rm <site> <domain> [--json]
    yeeet init [name]

Use yeeet --help or yeeet <command> --help for command-specific options. The global --api <url> option targets another compatible API endpoint.

## HTTP API

The OpenAPI document is available at https://docs.yeeet.dev/openapi.json. Authenticate with Authorization: Bearer <token> or X-API-Key: <api-key>.

To create a deployment directly, POST a manifest to /api/v1/deployments, PUT every file to its returned signed upload URL with the exact returned headers, then POST the returned completeUrl. The live pointer changes only after completion succeeds.

Manage releases through /api/v1/sites/{slug}/versions, privacy through the version access endpoint, and custom domains through /api/v1/sites/{slug}/domains. Prefer the CLI unless direct HTTP orchestration is necessary.

## Operational behavior

- Live aliases revalidate at the edge within about 10 seconds.
- Immutable version URLs use long-lived caching and never change.
- Public HTML without og:image or twitter:image receives an automatic 1200x630 social card at /_yeeet/og.png containing the site name, hostname, and its original deterministic Yeeetling. Author-provided image metadata always wins.
- Failed or partial uploads never replace the live release.
- A generated subdomain is returned when no name or project default is supplied.
- Registration is invitation-only. Administrators manage invitations and account access from /admin.
`

const DOCS_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#f3efe6">
    <meta name="description" content="Install the Yeeet CLI and deploy any static folder to a globally cached HTTPS URL in one command.">
    <meta name="robots" content="index,follow">
    <title>Yeeet CLI Docs — Folder to HTTPS in One Command</title>
    <link rel="canonical" href="https://docs.yeeet.dev/">
    <link rel="alternate" type="text/plain" href="https://docs.yeeet.dev/llms.txt" title="Yeeet docs for LLMs">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='3' y='3' width='58' height='58' rx='15' fill='%23f04d2f' stroke='%23171714' stroke-width='6'/%3E%3Cpath d='M17 17h8l7 12 7-12h8L36 36v12h-8V36L17 17Z' fill='%23171714'/%3E%3Ccircle cx='48' cy='46' r='4' fill='%23d7f544'/%3E%3C/svg%3E" type="image/svg+xml">
    <style>${DOCS_CSS}</style>
    <script>${DOCS_JS}</script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to documentation</a>
    <span class="sr-only" id="copy-status" aria-live="polite"></span>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="https://yeeet.dev" aria-label="Yeeet home">
          <span class="brand-mark" aria-hidden="true">Y!</span>
          <span class="brand-name" translate="no">yeeet.dev</span>
          <span class="brand-tag">Docs</span>
        </a>
        <nav class="header-nav" aria-label="Documentation navigation">
          <a class="llm-link" href="/llms.txt">LLM Text</a>
          <a class="api-link" href="/openapi.json">API</a>
          <a class="launch-link" href="https://yeeet.dev/dashboard">Dashboard ↗</a>
          <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle color theme" title="Toggle color theme">
            <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"/></svg>
            <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>
          </button>
        </nav>
      </div>
    </header>

    <main id="main-content">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-inner">
          <div>
            <span class="eyebrow">The CLI quick start</span>
            <h1 id="hero-title">From folder to <span>HTTPS</span> in one command.</h1>
            <p class="hero-lede">Yeeet gives any static build a global CDN, managed SSL, an immutable release history, and a memorable URL—without a deployment config file.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="#quick-start">Deploy Your First Site ↓</a>
              <a class="button button-secondary" href="#agents">Use Yeeet from an Agent</a>
            </div>
          </div>
          <aside class="quick-card" aria-label="3 command quick start">
            <div class="quick-card-head"><span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span>~/your-project</div>
            <ol>
              <li><code>npm install --global @yeeet.dev/cli</code></li>
              <li><code>yeeet login</code></li>
              <li><code>yeeet deploy ./dist</code></li>
            </ol>
            <div class="quick-result"><strong>✓ LIVE</strong> swift-comet-a1b2c3.site.yeeet.dev</div>
          </aside>
        </div>
      </section>

      <div class="docs-shell">
        <nav class="toc" aria-label="On this page">
          <p>On This Page</p>
          <a href="#overview">What Yeeet Is</a>
          <a href="#quick-start">Quick Start</a>
          <a href="#deploy">Deploy</a>
          <a href="#versions">Versions & Rollback</a>
          <a href="#private-sharing">Private Sharing</a>
          <a href="#domains">Custom Domains</a>
          <a href="#agents">Agents & CI</a>
          <a href="#commands">Command Reference</a>
          <a href="#troubleshooting">Troubleshooting</a>
          <div class="toc-machine">Machine-readable entry point:<br><a href="/llms.txt">/llms.txt</a></div>
        </nav>

        <article class="docs-content">
          <section class="docs-section" id="overview">
            <span class="section-label">00 / Mission Control</span>
            <h2>A Small Deployment Plane for Static Sites</h2>
            <p>Yeeet takes an already-built file or folder and publishes it as an atomic HTTPS release. It combines direct-to-bucket uploads, immutable versions, a movable live alias, SPA refresh support, private review links, custom domains, automatic social cards, and edge-aware caching behind one browser workflow and one CLI.</p>
            <p>It is intentionally focused: Yeeet serves static output and never executes an untrusted build. Run your framework's build locally or in CI, then hand Yeeet the resulting <span class="inline-code" translate="no">dist</span>, <span class="inline-code" translate="no">build</span>, <span class="inline-code" translate="no">out</span>, or <span class="inline-code" translate="no">public</span> directory.</p>
            <div class="workflow-grid">
              <article class="workflow-card">
                <h3>Developers</h3>
                <p>Ship a portfolio, documentation build, prototype, or client-side app with a generated Yeeetling preview card when you do not provide one.</p>
              </article>
              <article class="workflow-card">
                <h3>Review Teams</h3>
                <p>Keep immutable previews, roll back instantly, and share protected work through a revocable one-click link.</p>
              </article>
              <article class="workflow-card">
                <h3>Agents & CI</h3>
                <p>Use API keys, stable JSON, predictable exit codes, LLM-readable guidance, and an OpenAPI contract.</p>
              </article>
              <article class="workflow-card">
                <h3>Platform Operators</h3>
                <p>Run the complete MIT-licensed control plane on Railway with Postgres and private S3-compatible storage.</p>
              </article>
            </div>
            <div class="callout"><p><strong>Open source and self-hostable.</strong> Read the architecture, configuration, Railway setup, contribution guide, security policy, and MIT license in the <a href="https://github.com/nearbycoder/yeeet.dev">Yeeet GitHub repository</a>.</p></div>
          </section>

          <section class="docs-section" id="quick-start">
            <span class="section-label">01 / First Flight</span>
            <h2>Deploy Your First Site</h2>
            <p>Bring Node.js 20.19+ or 22.12+, a Yeeet account, and a folder containing static files. The CLI handles the manifest, parallel uploads, atomic activation, and URL.</p>
            <ol class="step-list">
              <li>
                <div>
                  <h3>Install the CLI</h3>
                  <p>Install the public package once so <span class="inline-code" translate="no">yeeet</span> is available from any project.</p>
                  <div class="code-block"><pre><code id="code-install">npm install --global @yeeet.dev/cli</code></pre><button class="copy-button" type="button" data-copy="code-install">Copy</button></div>
                </div>
              </li>
              <li>
                <div>
                  <h3>Log In from Your Terminal</h3>
                  <p>A one-time device flow opens in your browser. Your terminal never asks for or stores your password.</p>
                  <div class="code-block"><pre><code id="code-login">yeeet login</code></pre><button class="copy-button" type="button" data-copy="code-login">Copy</button></div>
                </div>
              </li>
              <li>
                <div>
                  <h3>Point at the Output Folder</h3>
                  <p>Yeeet creates a readable random subdomain when you do not specify a name.</p>
                  <div class="code-block"><pre><code id="code-first-deploy">yeeet deploy ./dist</code></pre><button class="copy-button" type="button" data-copy="code-first-deploy">Copy</button></div>
                </div>
              </li>
            </ol>
            <div class="callout"><p><strong>Need an account?</strong> Yeeet is invitation-only while the platform is young. Use an invitation at <a href="https://yeeet.dev/login">yeeet.dev/login</a>, then return to <span class="inline-code" translate="no">yeeet login</span>.</p></div>
          </section>

          <section class="docs-section" id="deploy">
            <span class="section-label">02 / Everyday Deploys</span>
            <h2>Random When Quick. Named When Stable.</h2>
            <p>Skip a name for an instant throwaway URL, or choose a name when the URL should remain stable across releases. Either way, the upload becomes visible only after every file is ready.</p>
            <div class="workflow-grid">
              <article class="workflow-card">
                <h3>Quick Preview</h3>
                <p><code translate="no">yeeet deploy ./dist</code></p>
                <p>Creates a readable URL such as <code translate="no">swift-comet-a1b2c3.site.yeeet.dev</code>.</p>
              </article>
              <article class="workflow-card">
                <h3>Stable Project URL</h3>
                <p><code translate="no">yeeet deploy ./dist --name comet</code></p>
                <p>Creates or updates <code translate="no">comet.site.yeeet.dev</code>.</p>
              </article>
              <article class="workflow-card">
                <h3>Single-Page App</h3>
                <p><code translate="no">yeeet deploy ./dist --spa</code></p>
                <p>SPA refresh support is already the default. Missing client routes serve <code translate="no">index.html</code>; missing assets stay 404s.</p>
              </article>
              <article class="workflow-card">
                <h3>Strict Static Files</h3>
                <p><code translate="no">yeeet deploy ./public --static</code></p>
                <p>Returns 404 unless a path maps to a real file, HTML file, or directory index.</p>
              </article>
            </div>
            <h3>Save Project Defaults</h3>
            <p>Run <span class="inline-code" translate="no">yeeet init comet</span> to create <span class="inline-code" translate="no">.yeeet.json</span>. From then on, the project name and routing mode travel with the project.</p>
            <div class="code-block"><pre><code id="code-init">yeeet init comet
yeeet deploy ./dist</code></pre><button class="copy-button" type="button" data-copy="code-init">Copy</button></div>
            <h3>Ship Headers and Redirects With the Site</h3>
            <p>Add <span class="inline-code" translate="no">_headers</span> and <span class="inline-code" translate="no">_redirects</span> at the deployed root. Yeeet validates them, keeps them private, and versions them with the files, so rollback restores the complete delivery behavior.</p>
            <div class="code-block"><pre><code id="code-rules"># _headers
/assets/*
  Cache-Control: public, max-age=604800

# _redirects
/old/:page /new/:page 308
/app/* /index.html 200</code></pre><button class="copy-button" type="button" data-copy="code-rules">Copy</button></div>
          </section>

          <section class="docs-section" id="versions">
            <span class="section-label">03 / Releases</span>
            <h2>Every Launch Is Recoverable</h2>
            <p>A named site is a movable pointer to an immutable release. List history, preview any version, or atomically make an older version live again.</p>
            <div class="code-block"><pre><code id="code-versions">yeeet versions comet
yeeet rollback comet 52eabb5f

# Or roll back to the previous ready release
yeeet rollback comet</code></pre><button class="copy-button" type="button" data-copy="code-versions">Copy</button></div>
            <p>Version commands accept a full deployment ID or an unambiguous prefix of at least 8 characters. Live aliases revalidate at the edge in about 10 seconds; immutable preview URLs never change.</p>
            <h3>See the Diff Before Takeoff</h3>
            <p>A dry run hashes the local folder and reports added, changed, removed, and unchanged paths without creating a deployment or touching storage.</p>
            <div class="code-block"><pre><code id="code-dry-run">yeeet deploy ./dist --name comet --dry-run
yeeet deploy ./dist --name comet --dry-run --json</code></pre><button class="copy-button" type="button" data-copy="code-dry-run">Copy</button></div>
            <h3>Stage Without Moving Production</h3>
            <p>Channels are mutable, no-index aliases under the same wildcard certificate. A channel deploy leaves the normal production URL untouched.</p>
            <div class="code-block"><pre><code id="code-channels">yeeet deploy ./dist --name comet --channel staging
yeeet channel list comet
yeeet channel set comet staging 52eabb5f
yeeet channel remove comet staging</code></pre><button class="copy-button" type="button" data-copy="code-channels">Copy</button></div>
            <h3>Remove What You No Longer Need</h3>
            <div class="code-block"><pre><code id="code-remove">yeeet version remove comet 52eabb5f --yes
yeeet remove comet --yes</code></pre><button class="copy-button" type="button" data-copy="code-remove">Copy</button></div>
            <div class="callout"><p><strong>Deletion is permanent.</strong> The <span class="inline-code" translate="no">--yes</span> flag confirms removal of stored objects. If you delete the live version, Yeeet promotes the newest remaining ready version.</p></div>
          </section>

          <section class="docs-section" id="private-sharing">
            <span class="section-label">04 / Private Reviews</span>
            <h2>Protect It. Share It in One Click.</h2>
            <p>Password protect a launch, then send a signed share URL. Reviewers need no Yeeet account and do not have to type the password.</p>
            <div class="code-block"><pre><code id="code-private">export YEEET_DEPLOY_PASSWORD="a long private password"
yeeet deploy ./dist --name review
yeeet share review</code></pre><button class="copy-button" type="button" data-copy="code-private">Copy</button></div>
            <p>Change access without re-uploading files. Rotating the link revokes both the previous URL and existing viewer cookies.</p>
            <div class="code-block"><pre><code id="code-access">yeeet access protect review &lt;version&gt; --password "a new password"
yeeet access rotate-link review &lt;version&gt;
yeeet access public review &lt;version&gt;</code></pre><button class="copy-button" type="button" data-copy="code-access">Copy</button></div>
          </section>

          <section class="docs-section" id="domains">
            <span class="section-label">05 / Your Domain</span>
            <h2>Bring a Custom Hostname</h2>
            <p>Attach a hostname from the CLI. Yeeet returns the routing and ownership-verification records; Railway provisions and renews TLS once DNS verifies.</p>
            <div class="code-block"><pre><code id="code-domains">yeeet domain add comet www.example.com --json

# After adding every returned DNS record
yeeet domain refresh comet www.example.com --json
yeeet domain list comet --json</code></pre><button class="copy-button" type="button" data-copy="code-domains">Copy</button></div>
            <p>Add every returned DNS record exactly as shown. Propagation time depends on your DNS provider. Use <span class="inline-code" translate="no">domain list</span> to inspect routing, verification, and certificate status.</p>
          </section>

          <section class="docs-section" id="agents">
            <span class="section-label">06 / Automation</span>
            <h2>Predictable for Agents & CI</h2>
            <p>Create an API key in the dashboard, provide it through the environment, and request JSON. The same CLI works interactively, in CI, or as an agent tool.</p>
            <div class="code-block"><pre><code id="code-agent">export YEEET_TOKEN="yeeet_…"
yeeet whoami --json
yeeet deploy ./dist --json</code></pre><button class="copy-button" type="button" data-copy="code-agent">Copy</button></div>
            <div class="callout"><p><strong>Secret handling:</strong> never print, commit, or place <span class="inline-code" translate="no">YEEET_TOKEN</span> in a prompt. Inject it from your CI secret store or agent environment.</p></div>
            <h3>Pull Request Previews</h3>
            <p>Use <span class="inline-code" translate="no">nearbycoder/yeeet.dev@main</span> in GitHub Actions. Each trusted pull request gets a stable <span class="inline-code" translate="no">&lt;site&gt;-pr-&lt;number&gt;</span> URL, an updated PR comment, and cleanup when the PR closes.</p>
            <div class="code-block"><pre><code id="code-github-action">- uses: nearbycoder/yeeet.dev@main
  with:
    token: \${{ secrets.YEEET_TOKEN }}
    github-token: \${{ github.token }}
    site: docs
    directory: dist</code></pre><button class="copy-button" type="button" data-copy="code-github-action">Copy</button></div>
            <div class="agent-panel">
              <div class="agent-panel-content">
                <h3>Start with One Plain-Text URL</h3>
                <p><span class="inline-code" translate="no">/llms.txt</span> is the concise operational contract. Use the full document for detailed behavior and OpenAPI when direct HTTP orchestration is necessary.</p>
                <div class="code-block"><pre><code id="code-curl">curl -fsSL https://docs.yeeet.dev/llms.txt</code></pre><button class="copy-button" type="button" data-copy="code-curl">Copy</button></div>
              </div>
              <div class="agent-links">
                <a href="/llms.txt">llms.txt ↗</a>
                <a href="/llms-full.txt">llms-full.txt ↗</a>
                <a href="/openapi.json">openapi.json ↗</a>
              </div>
            </div>
            <ul class="plain-list">
              <li><strong>Exit 0:</strong> deployment succeeded and stdout contains the final JSON object.</li>
              <li><strong>Exit 2:</strong> authentication is required; provide <span class="inline-code" translate="no">YEEET_TOKEN</span>.</li>
              <li><strong>Exit 1:</strong> validation, upload, or network failure; stderr explains the next action.</li>
            </ul>
          </section>

          <section class="docs-section" id="commands">
            <span class="section-label">07 / Reference</span>
            <h2>Command Map</h2>
            <p>Use <span class="inline-code" translate="no">yeeet --help</span> or <span class="inline-code" translate="no">yeeet &lt;command&gt; --help</span> for every option.</p>
            <div class="command-table-wrap">
              <table>
                <thead><tr><th scope="col">Command</th><th scope="col">Purpose</th></tr></thead>
                <tbody>
                  <tr><td>login / logout / whoami</td><td>Manage the local device session and verify identity.</td></tr>
                  <tr><td>deploy|up [path]</td><td>Upload a file or folder and atomically activate the ready release.</td></tr>
                  <tr><td>sites</td><td>List live sites owned by the current account.</td></tr>
                  <tr><td>versions &lt;site&gt;</td><td>List immutable releases, preview URLs, status, routing mode, and privacy.</td></tr>
                  <tr><td>rollback &lt;site&gt; [version]</td><td>Promote an older ready release, or the previous release when omitted.</td></tr>
                  <tr><td>version remove …</td><td>Permanently remove one release and its stored objects.</td></tr>
                  <tr><td>remove &lt;site&gt;</td><td>Permanently remove a site, its releases, domains, and stored objects.</td></tr>
                  <tr><td>share &lt;site&gt; [version]</td><td>Print the signed one-click URL for a protected release.</td></tr>
                  <tr><td>access …</td><td>Protect a release, make it public, or rotate its private link.</td></tr>
                  <tr><td>domain …</td><td>Add, list, refresh, or remove custom-domain mappings.</td></tr>
                  <tr><td>init [name]</td><td>Create a project-level <span class="inline-code" translate="no">.yeeet.json</span>.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="docs-section" id="troubleshooting">
            <span class="section-label">08 / When Things Drift</span>
            <h2>Quick Fixes</h2>
            <div class="workflow-grid">
              <article class="workflow-card"><h3>Not Authenticated</h3><p>Run <code translate="no">yeeet whoami</code>. Humans can repeat <code translate="no">yeeet login</code>; automation should verify <code translate="no">YEEET_TOKEN</code> is present.</p></article>
              <article class="workflow-card"><h3>Wrong Output Folder</h3><p>Run your framework build, then deploy the folder that actually contains <code translate="no">index.html</code>, such as dist, build, or out.</p></article>
              <article class="workflow-card"><h3>SPA Refresh Returns 404</h3><p>SPA fallback is the default. Check that <code translate="no">index.html</code> exists and remove <code translate="no">--static</code> or set <code translate="no">spaFallback</code> to true.</p></article>
              <article class="workflow-card"><h3>Custom-Domain TLS Is Pending</h3><p>Add every DNS record returned by <code translate="no">domain add</code>, wait for propagation, then run <code translate="no">domain refresh</code>.</p></article>
            </div>
          </section>
        </article>
      </div>
    </main>

    <footer class="footer">
      <div class="footer-inner">
        <a class="brand" href="https://yeeet.dev" aria-label="Yeeet home">
          <span class="brand-mark" aria-hidden="true">Y!</span>
          <span class="brand-name" translate="no">yeeet.dev</span>
        </a>
        <p>Static sites at terminal velocity.<br>Human-readable. Agent-friendly.</p>
      </div>
    </footer>
  </body>
</html>`

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3efe6"><meta name="robots" content="noindex"><title>Not found · Yeeet docs</title><style>${DOCS_CSS}</style><script>${DOCS_JS}</script></head><body><button class="theme-toggle not-found-theme" type="button" data-theme-toggle aria-label="Toggle color theme" title="Toggle color theme"><svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"/></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg></button><main class="not-found"><span class="section-label">404 / Off Course</span><h1>Nothing landed here.</h1><p class="hero-lede">The documentation path you requested does not exist.</p><p><a class="button button-primary" href="/">Return to the CLI docs</a></p></main></body></html>`

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="15" fill="#f04d2f" stroke="#171714" stroke-width="6"/><path d="M17 17h8l7 12 7-12h8L36 36v12h-8V36L17 17Z" fill="#171714"/><circle cx="48" cy="46" r="4" fill="#d7f544"/></svg>`

const ROBOTS_TXT = `User-agent: *\nAllow: /\n\nSitemap: https://docs.yeeet.dev/sitemap.xml\n`

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://docs.yeeet.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>https://docs.yeeet.dev/llms.txt</loc><changefreq>weekly</changefreq><priority>0.8</priority></url><url><loc>https://docs.yeeet.dev/llms-full.txt</loc><changefreq>weekly</changefreq><priority>0.8</priority></url></urlset>`

function docsHeaders(contentType: string, immutable = false) {
  return {
    'cache-control': immutable
      ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
      : 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'content-type': contentType,
    'cross-origin-opener-policy': 'same-origin',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
  }
}

function docsResponse(
  request: Request,
  body: string,
  contentType: string,
  status = 200,
  immutable = false,
) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: docsHeaders(contentType, immutable),
  })
}

function configuredDocument(value: string) {
  return value
    .replaceAll('https://docs.yeeet.dev', docsUrl())
    .replaceAll('https://yeeet.dev', controlPlaneUrl())
    .replaceAll('site.yeeet.dev', siteDomain())
}

export function maybeServeDocs(request: Request): Response | null {
  const url = new URL(request.url)
  const configuredDocsHost = docsHost()
  const requestHost = url.hostname.toLowerCase()
  if (
    requestHost !== configuredDocsHost &&
    process.env.DOCS_PREVIEW !== 'true'
  ) {
    const platformHost = new URL(controlPlaneUrl()).hostname.toLowerCase()
    if (
      requestHost === platformHost &&
      url.pathname === '/llms.txt' &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      return new Response(null, {
        status: 307,
        headers: {
          ...docsHeaders('text/plain; charset=utf-8'),
          location: `${docsUrl()}/llms.txt`,
        },
      })
    }
    return null
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        ...docsHeaders('text/plain; charset=utf-8'),
        allow: 'GET, HEAD',
      },
    })
  }

  switch (url.pathname) {
    case '/':
    case '/index.html':
      return docsResponse(
        request,
        configuredDocument(DOCS_HTML),
        'text/html; charset=utf-8',
      )
    case '/docs.css':
      return docsResponse(
        request,
        DOCS_CSS,
        'text/css; charset=utf-8',
        200,
        true,
      )
    case '/docs.js':
      return docsResponse(
        request,
        DOCS_JS,
        'text/javascript; charset=utf-8',
        200,
        true,
      )
    case '/favicon.svg':
      return docsResponse(
        request,
        FAVICON_SVG,
        'image/svg+xml; charset=utf-8',
        200,
        true,
      )
    case '/llms.txt':
      return docsResponse(
        request,
        configuredDocument(LLMS_TXT),
        'text/plain; charset=utf-8',
      )
    case '/llms-full.txt':
      return docsResponse(
        request,
        configuredDocument(LLMS_FULL_TXT),
        'text/plain; charset=utf-8',
      )
    case '/robots.txt':
      return docsResponse(
        request,
        configuredDocument(ROBOTS_TXT),
        'text/plain; charset=utf-8',
      )
    case '/sitemap.xml':
      return docsResponse(
        request,
        configuredDocument(SITEMAP_XML),
        'application/xml; charset=utf-8',
      )
    case '/openapi.json':
      return new Response(null, {
        status: 307,
        headers: {
          ...docsHeaders('text/plain; charset=utf-8'),
          location: `${controlPlaneUrl()}/openapi.json`,
        },
      })
    default:
      return docsResponse(
        request,
        NOT_FOUND_HTML,
        'text/html; charset=utf-8',
        404,
      )
  }
}
