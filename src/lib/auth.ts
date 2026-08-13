import { apiKey } from '@better-auth/api-key'
import { APIError, betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, deviceAuthorization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import * as schema from '#/db/schema'
import {
  recordInvitationUse,
  validateInvitationCode,
  validateInvitationGrant,
} from '#/server/invitations'
import { HttpError } from '#/server/http'
import { controlPlaneUrl, siteWildcardOrigin } from '#/server/platform-config'

const githubEnabled = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
)

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

function contextHeaders(context: {
  headers?: Headers | null
  request?: Request | null
}) {
  return context.headers ?? context.request?.headers ?? null
}

async function invitationFromContext(context: {
  path?: string
  headers?: Headers | null
  request?: Request | null
}) {
  const headers = contextHeaders(context)
  return context.path === '/sign-up/email'
    ? validateInvitationCode(headers?.get('x-yeeet-invitation'))
    : validateInvitationGrant(headers)
}

function invitationError(error: unknown): never {
  if (error instanceof HttpError) {
    throw new APIError('FORBIDDEN', {
      message: error.message,
      code: error.code,
    })
  }
  throw error
}

export const auth = betterAuth({
  appName: 'Yeeet',
  baseURL: controlPlaneUrl(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== '/sign-up/email') return
      try {
        await invitationFromContext(context)
      } catch (error) {
        invitationError(error)
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser, context) => {
          try {
            await invitationFromContext(context ?? {})
          } catch (error) {
            invitationError(error)
          }
          return {
            data: {
              ...newUser,
              role: adminEmails.has(newUser.email.toLowerCase())
                ? 'admin'
                : 'user',
            },
          }
        },
        after: async (_newUser, context) => {
          try {
            const invitation = await invitationFromContext(context ?? {})
            await recordInvitationUse(invitation.id)
          } catch (error) {
            console.error('Could not record invitation use', error)
          }
        },
      },
    },
  },
  socialProviders: githubEnabled
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          scope: ['user:email'],
        },
      }
    : undefined,
  trustedOrigins: [controlPlaneUrl(), siteWildcardOrigin()],
  advanced: {
    ipAddress: {
      // Railway's edge supplies the original client as a single trusted value.
      ipAddressHeaders: ['x-real-ip'],
    },
  },
  plugins: [
    bearer(),
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
      defaultBanReason: 'Platform policy violation',
      bannedUserMessage:
        'This account has been suspended. Contact the Yeeet administrator for help.',
    }),
    apiKey({
      defaultPrefix: 'yeeet_',
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
    }),
    deviceAuthorization({
      verificationUri: '/device',
      expiresIn: '15m',
      validateClient: (clientId) => clientId === 'yeeet-cli',
    }),
    // This must remain last so server-side auth calls can set Start cookies.
    tanstackStartCookies(),
  ],
})
