import { createFileRoute } from '@tanstack/react-router'
import { json } from '#/server/http'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: () =>
        json({ ok: true, service: 'yeeet', time: new Date().toISOString() }),
    },
  },
})
