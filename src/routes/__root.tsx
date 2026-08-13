import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { ThemeToggle } from '#/components/theme-toggle'
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
      { name: 'theme-color', content: '#f5f1e8' },
      { title: 'Yeeet — static sites at terminal velocity' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%23171714%22/><path d=%22M14 16h11l7 12 7-12h11L37 37v11H27V37z%22 fill=%22%23f04d2f%22/></svg>',
      },
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
            __html: `(function(){try{var stored=localStorage.getItem('yeeet-theme');var theme=stored==='light'||stored==='dark'?stored:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#171714':'#f5f1e8'}catch(_){}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <ThemeToggle />
        <Scripts />
      </body>
    </html>
  )
}
