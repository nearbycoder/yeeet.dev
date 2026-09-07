import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/db'
import {
  deploymentFeedback,
  deployments,
  sites,
  user,
  workspaces,
  workspaceMembers,
  workspaceSites,
} from '../../src/db/schema'
import { editFeedback } from '../../src/server/feedback-edit'

after(() => db.$client.end())
test('only a current workspace author can edit feedback, with conflict detection and timestamps', async () => {
  const owner = randomUUID(),
    author = randomUUID(),
    site = randomUUID(),
    version = randomUUID(),
    workspace = randomUUID(),
    id = randomUUID(),
    member = randomUUID()
  await db.insert(user).values(
    [owner, author].map((key) => ({
      id: key,
      name: 'Feedback fixture',
      email: `${key}@example.com`,
    })),
  )
  try {
    await db
      .insert(sites)
      .values({ id: site, userId: owner, slug: `edit-${site.slice(0, 8)}` })
    await db
      .insert(deployments)
      .values({ id: version, siteId: site, userId: owner, status: 'ready' })
    await db
      .insert(workspaces)
      .values({ id: workspace, ownerId: owner, name: 'Editing' })
    await db.insert(workspaceMembers).values({
      id: member,
      workspaceId: workspace,
      userId: author,
      role: 'viewer',
    })
    await db
      .insert(workspaceSites)
      .values({ id: randomUUID(), workspaceId: workspace, siteId: site })
    await db.insert(deploymentFeedback).values({
      id,
      workspaceId: workspace,
      deploymentId: version,
      authorId: author,
      body: 'Before',
      path: '/',
    })
    const input = {
      workspace,
      id,
      body: 'After',
      path: '/about',
      expectedBody: 'Before',
      expectedPath: '/',
    }
    await assert.rejects(editFeedback(owner, input), /Only the author/)
    await editFeedback(author, input)
    const saved = await db.query.deploymentFeedback.findFirst({
      where: eq(deploymentFeedback.id, id),
    })
    assert.equal(saved?.body, 'After')
    assert.ok(saved.editedAt)
    await assert.rejects(editFeedback(author, input), /changed elsewhere/)
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, member))
    await assert.rejects(
      editFeedback(author, {
        ...input,
        expectedBody: 'After',
        expectedPath: '/about',
      }),
      /Workspace not found/,
    )
  } finally {
    await db.delete(user).where(inArray(user.id, [owner, author]))
  }
})
