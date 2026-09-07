import { S3Client } from '@aws-sdk/client-s3'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import {
  deploymentFeedback,
  deployments,
  sites,
  storageCleanupJobs,
  user,
  workspaceSites,
  workspaces,
} from '../../src/db/schema'
import {
  activateSiteVersion,
  completeDeployment,
  deleteSiteVersion,
  deleteOwnedSite,
  setSiteChannel,
} from '../../src/server/deployments'
import { executeRetention, previewRetention } from '../../src/server/retention'
import { mutateWorkspace } from '../../src/server/workspaces'
import { setPreviewExpiry } from '../../src/server/lifecycle'

if (!process.env.DATABASE_URL)
  throw new Error(
    'Use an isolated, migrated PostgreSQL database for integration tests.',
  )
after(() => db.$client.end())
const owner = randomUUID()
const workspace = randomUUID()
const policy = { keepCount: 1, minAgeDays: 1 }
async function fixture() {
  const site = {
    id: randomUUID(),
    slug: `lock-${randomUUID().slice(0, 8)}`,
    userId: owner,
  }
  const old = randomUUID(),
    current = randomUUID(),
    upload = randomUUID()
  await db.insert(sites).values({ ...site, activeDeploymentId: current })
  await db.insert(deployments).values([
    {
      id: old,
      siteId: site.id,
      userId: owner,
      status: 'ready',
      createdAt: new Date('2020-01-01'),
    },
    {
      id: current,
      siteId: site.id,
      userId: owner,
      status: 'ready',
      createdAt: new Date('2021-01-01'),
    },
    {
      id: upload,
      siteId: site.id,
      userId: owner,
      status: 'uploading',
      createdAt: new Date('2022-01-01'),
    },
  ])
  await db
    .insert(workspaceSites)
    .values({ id: randomUUID(), workspaceId: workspace, siteId: site.id })
  return { ...site, old, current, upload }
}
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Operation stayed blocked')),
          5000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function observe<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error: error as Error }),
  )
}
async function gate<T>(
  siteId: string,
  work: (
    unlock: () => Promise<void>,
    waiting: (count: number) => Promise<void>,
  ) => Promise<T>,
) {
  const connection = await db.$client.connect()
  const {
    rows: [{ pid }],
  } = await connection.query('select pg_backend_pid() as pid')
  await connection.query('begin')
  await connection.query('select id from sites where id=$1 for update', [
    siteId,
  ])
  let released = false
  const unlock = async () => {
    if (!released) {
      await connection.query('rollback')
      released = true
    }
  }
  const waiting = async (count: number) =>
    bounded(
      (async () => {
        for (;;) {
          const result = await db.$client.query(
            `with recursive blocked(pid) as (
        select pid from pg_stat_activity where $1 = any(pg_blocking_pids(pid))
        union select a.pid from pg_stat_activity a join blocked b on b.pid = any(pg_blocking_pids(a.pid))
      ) select count(distinct pid)::integer as count from blocked`,
            [pid],
          )
          if (result.rows[0].count >= count) return
          await delay(10)
        }
      })(),
    )
  try {
    return await work(unlock, waiting)
  } finally {
    await unlock()
    connection.release()
  }
}
const clean = (site: Awaited<ReturnType<typeof fixture>>) =>
  executeRetention(owner, {
    ...policy,
    slug: site.slug,
    expectedIds: [site.old],
  })
const live = async (id: string) =>
  (await db.query.sites.findFirst({ where: eq(sites.id, id) }))
    ?.activeDeploymentId

test(
  'site locking coordinates cleanup with real concurrent mutations',
  { timeout: 30000 },
  async (t) => {
    // No object-store requests may escape this PostgreSQL concurrency suite.
    t.mock.method(S3Client.prototype, 'send', async () => {
      throw new Error('Simulated object-store outage')
    })
    await db.insert(user).values({
      id: owner,
      name: 'Lock fixture',
      email: `${owner}@example.com`,
    })
    await db
      .insert(workspaces)
      .values({ id: workspace, ownerId: owner, name: 'Locks' })
    try {
      await t.test(
        'a blocked site does not block promotion or cleanup on another site',
        async () => {
          const a = await fixture(),
            b = await fixture()
          await gate(a.id, async (unlock, waiting) => {
            const pending = observe(clean(a))
            await waiting(1)
            await bounded(activateSiteVersion(owner, b.slug, b.current))
            assert.equal((await bounded(clean(b))).deletedCount, 1)
            await unlock()
            assert.equal((await pending).ok, true)
          })
        },
      )
      for (const action of [
        'promotion',
        'channel',
        'comment',
        'reopen',
      ] as const) {
        await t.test(
          `${action} winning the lock protects the version and rejects a stale cleanup plan`,
          async () => {
            const site = await fixture()
            const feedbackId = randomUUID()
            if (action === 'reopen')
              await db.insert(deploymentFeedback).values({
                id: feedbackId,
                workspaceId: workspace,
                deploymentId: site.old,
                authorId: owner,
                body: 'Review',
                resolved: true,
              })
            await gate(site.id, async (unlock, waiting) => {
              const writer = observe(
                action === 'promotion'
                  ? activateSiteVersion(owner, site.slug, site.old)
                  : action === 'channel'
                    ? setSiteChannel(owner, site.slug, 'review', site.old)
                    : mutateWorkspace(
                        owner,
                        action === 'comment'
                          ? {
                              action: 'comment',
                              workspace,
                              slug: site.slug,
                              version: site.old,
                              body: 'Keep for review',
                              path: '/',
                            }
                          : {
                              action: 'resolve',
                              workspace,
                              feedbackId,
                              resolved: false,
                            },
                      ),
              )
              await waiting(1)
              const cleanup = observe(clean(site))
              await waiting(2)
              await unlock()
              assert.equal((await writer).ok, true)
              const result = await cleanup
              assert.equal(result.ok, false)
              assert.match(result.error.message, /plan changed/)
              assert.ok(
                await db.query.deployments.findFirst({
                  where: eq(deployments.id, site.old),
                }),
              )
              assert.equal(
                (await previewRetention(owner, { ...policy, slug: site.slug }))
                  .candidates.length,
                0,
              )
            })
          },
        )
      }
      await t.test(
        'cleanup winning the lock rejects waiting promotion, channel assignment and feedback without dangling references',
        async () => {
          const site = await fixture()
          await gate(site.id, async (unlock, waiting) => {
            const cleanup = observe(clean(site))
            await waiting(1)
            const promotion = observe(
              activateSiteVersion(owner, site.slug, site.old),
            )
            await waiting(2)
            const channel = observe(
              setSiteChannel(owner, site.slug, 'review', site.old),
            )
            await waiting(3)
            const feedback = observe(
              mutateWorkspace(owner, {
                action: 'comment',
                workspace,
                slug: site.slug,
                version: site.old,
                body: 'Too late',
                path: '/',
              }),
            )
            await waiting(4)
            await unlock()
            assert.equal((await cleanup).ok, true)
            for (const result of await Promise.all([
              promotion,
              channel,
              feedback,
            ]))
              assert.equal(result.ok, false)
            assert.equal(await live(site.id), site.current)
            assert.equal(
              await db.query.deployments.findFirst({
                where: eq(deployments.id, site.old),
              }),
              undefined,
            )
            assert.ok(
              await db.query.storageCleanupJobs.findFirst({
                where: eq(storageCleanupJobs.id, site.old),
              }),
            )
          })
        },
      )
      await t.test(
        'duplicate completion cannot override a promotion committed between completions',
        async () => {
          const site = await fixture()
          await gate(site.id, async (unlock, waiting) => {
            const first = observe(
              completeDeployment(
                { userId: owner, authType: 'session' },
                site.upload,
              ),
            )
            await waiting(1)
            const promote = observe(
              activateSiteVersion(owner, site.slug, site.old),
            )
            await waiting(2)
            const duplicate = observe(
              completeDeployment(
                { userId: owner, authType: 'session' },
                site.upload,
              ),
            )
            await waiting(3)
            await unlock()
            for (const result of await Promise.all([first, promote, duplicate]))
              assert.equal(result.ok, true)
            assert.equal(await live(site.id), site.old)
            assert.equal(
              (
                await db.query.deployments.findFirst({
                  where: eq(deployments.id, site.upload),
                })
              )?.status,
              'ready',
            )
          })
        },
      )
      await t.test(
        'expiry rechecks production after waiting for a promotion',
        async () => {
          const site = await fixture()
          await gate(site.id, async (unlock, waiting) => {
            const promotion = observe(
              activateSiteVersion(owner, site.slug, site.old),
            )
            await waiting(1)
            const expiry = observe(
              setPreviewExpiry(owner, {
                slug: site.slug,
                version: site.old,
                hours: 24,
              }),
            )
            await waiting(2)
            await unlock()
            assert.equal((await promotion).ok, true)
            const result = await expiry
            assert.equal(result.ok, false)
            assert.match(result.error.message, /Production cannot expire/)
          })
        },
      )
      await t.test(
        'manual deletion after promotion chooses a fresh replacement and queues failed storage cleanup',
        async () => {
          const site = await fixture()
          await gate(site.id, async (unlock, waiting) => {
            const promotion = observe(
              activateSiteVersion(owner, site.slug, site.old),
            )
            await waiting(1)
            const deletion = observe(
              deleteSiteVersion(owner, site.slug, site.old),
            )
            await waiting(2)
            await unlock()
            assert.equal((await promotion).ok, true)
            const result = await deletion
            assert.equal(result.ok, true)
            assert.equal(result.value.wasActive, true)
            assert.equal(result.value.activeDeploymentId, site.current)
            assert.equal(result.value.cleanupPending, true)
            assert.equal(await live(site.id), site.current)
            assert.ok(
              await db.query.storageCleanupJobs.findFirst({
                where: eq(storageCleanupJobs.id, site.old),
              }),
            )
          })
        },
      )
      await t.test(
        'site deletion commits before object cleanup and prevents a waiting upload from reviving it',
        async () => {
          const site = await fixture()
          await gate(site.id, async (unlock, waiting) => {
            const deletion = observe(deleteOwnedSite(owner, site.slug))
            await waiting(1)
            const completion = observe(
              completeDeployment(
                { userId: owner, authType: 'session' },
                site.upload,
              ),
            )
            await waiting(2)
            await unlock()
            const removed = await deletion
            assert.equal(removed.ok, true)
            assert.equal(removed.value.cleanupPending, true)
            assert.equal((await completion).ok, false)
            assert.equal(await live(site.id), undefined)
            assert.ok(
              await db.query.storageCleanupJobs.findFirst({
                where: eq(storageCleanupJobs.id, site.id),
              }),
            )
          })
        },
      )
    } finally {
      await db
        .delete(storageCleanupJobs)
        .where(eq(storageCleanupJobs.userId, owner))
      await db.delete(user).where(eq(user.id, owner))
    }
  },
)
