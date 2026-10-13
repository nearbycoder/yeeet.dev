import { ApplyReadingPreferences } from '#/components/reading-preferences'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'description',
        content:
          'Yeeet static sites from your terminal or browser. Instant subdomains, SSL, and CDN delivery.',
      },
      { name: 'theme-color', content: '#f7f7f4' },
      { name: 'color-scheme', content: 'light dark' },
      { property: 'og:site_name', content: 'Yeeet' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { title: 'Yeeet — static sites at terminal velocity' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'preload',
        href: '/fonts/manrope-latin-400-800.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem('yeeet-theme');var theme=stored==='light'||stored==='dark'?stored:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#181b17':'#f7f7f4'}catch(_){}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <ApplyReadingPreferences />
        <Scripts />
      </body>
    </html>
  )
}
