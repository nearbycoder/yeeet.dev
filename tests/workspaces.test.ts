import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { workspaceActionSchema } from '../src/lib/workspaces'
import {
  actorForWorkspaceSite,
  mutateWorkspace,
  requireWorkspace,
} from '../src/server/workspaces'

test('workspace feedback accepts local paths and rejects empty or excessive comments', () => {
  const input = {
    action: 'comment',
    workspace: 'w',
    slug: 'comet',
    version: 'v',
    body: 'Review this',
    path: '/pricing',
  }
  assert.equal(workspaceActionSchema.parse(input).action, 'comment')
  for (const path of ['//example.com', 'https://example.com', '/\\example.com'])
    assert.throws(() => workspaceActionSchema.parse({ ...input, path }))
  assert.throws(() => workspaceActionSchema.parse({ ...input, body: ' ' }))
  assert.throws(() =>
    workspaceActionSchema.parse({ ...input, body: 'x'.repeat(4001) }),
  )
})
test('workspace membership is required and viewers cannot edit or manage members', async (t) => {
  t.mock.method(db.query.user, 'findFirst', async () => ({
    id: 'owner',
    banned: false,
  }))
  t.mock.method(db.query.workspaces, 'findFirst', async () => ({
    id: 'w',
    ownerId: 'owner',
  }))
  let member: { role: string } | undefined = undefined
  t.mock.method(db.query.workspaceMembers, 'findFirst', async () => member)
  await assert.rejects(requireWorkspace('outsider', 'w'), /Workspace not found/)
  member = { role: 'viewer' }
  assert.equal((await requireWorkspace('viewer', 'w')).role, 'viewer')
  await assert.rejects(
    requireWorkspace('viewer', 'w', 'edit'),
    /role does not allow/,
  )
  await assert.rejects(
    mutateWorkspace('viewer', {
      action: 'member',
      workspace: 'w',
      email: 'new@example.com',
      role: 'editor',
    }),
    /role does not allow/,
  )
  member = { role: 'editor' }
  assert.equal((await requireWorkspace('editor', 'w', 'edit')).role, 'editor')
  await assert.rejects(
    requireWorkspace('editor', 'w', 'owner'),
    /role does not allow/,
  )
})
test('delegated deployment access is scoped to the assigned site and revoked membership takes effect', async (t) => {
  t.mock.method(db.query.sites, 'findFirst', async () => ({
    id: 'site',
    userId: 'owner',
  }))
  t.mock.method(db.query.workspaceSites, 'findFirst', async () => ({
    workspaceId: 'w',
  }))
  t.mock.method(db.query.workspaces, 'findFirst', async () => ({
    id: 'w',
    ownerId: 'owner',
  }))
  let member: { role: string } | undefined = { role: 'editor' }
  t.mock.method(db.query.workspaceMembers, 'findFirst', async () => member)
  t.mock.method(db.query.user, 'findFirst', async () => ({
    id: 'owner',
    banned: false,
  }))
  const actor = { userId: 'editor', authType: 'session' as const }
  assert.deepEqual(await actorForWorkspaceSite(actor, 'comet'), {
    ...actor,
    userId: 'owner',
    actingUserId: 'editor',
  })
  member = undefined
  await assert.rejects(
    actorForWorkspaceSite(actor, 'comet'),
    /Workspace not found/,
  )
})

test('shared workspaces cannot bypass an owner account suspension', async (t) => {
  t.mock.method(db.query.workspaces, 'findFirst', async () => ({
    id: 'w',
    ownerId: 'owner',
  }))
  t.mock.method(db.query.workspaceMembers, 'findFirst', async () => ({
    role: 'editor',
  }))
  t.mock.method(db.query.user, 'findFirst', async () => ({
    id: 'owner',
    banned: true,
  }))
  await assert.rejects(
    requireWorkspace('editor', 'w', 'edit'),
    /owner is unavailable/,
  )
})
