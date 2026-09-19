import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Native image rendering runs on the server and cannot be prebundled as JS.
  optimizeDeps: { exclude: ['@resvg/resvg-js'] },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//, /^@resvg\/resvg-js/] },
    }),

    tanstackStart(),
    viteReact(),
  ],
})

export default config
