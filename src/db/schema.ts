import { relations } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

export * from './auth-schema'

export const deploymentStatus = pgEnum('deployment_status', [
  'uploading',
  'ready',
  'failed',
])

export const sites = pgTable(
  'sites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    activeDeploymentId: text('active_deployment_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    notes: text('notes').default('').notNull(),
  },
  (table) => [
    uniqueIndex('sites_slug_idx').on(table.slug),
    index('sites_user_id_idx').on(table.userId),
    index('sites_owner_page_idx').on(table.userId, table.createdAt, table.id),
  ],
)

export const deployments = pgTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: deploymentStatus('status').default('uploading').notNull(),
    source: text('source').default('web').notNull(),
    fileCount: bigint('file_count', { mode: 'number' }).default(0).notNull(),
    totalBytes: bigint('total_bytes', { mode: 'number' }).default(0).notNull(),
    error: text('error'),
    spaFallback: boolean('spa_fallback').default(true).notNull(),
    channel: text('channel'),
    idempotencyKey: text('idempotency_key'),
    requestFingerprint: text('request_fingerprint'),
    headerRules: text('header_rules').default('[]').notNull(),
    redirectRules: text('redirect_rules').default('[]').notNull(),
    passwordHash: text('password_hash'),
    shareNonce: text('share_nonce').default('').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    activatedAt: timestamp('activated_at'),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    index('deployments_site_id_idx').on(table.siteId),
    index('deployments_site_page_idx').on(
      table.siteId,
      table.createdAt,
      table.id,
    ),
    index('deployments_user_id_idx').on(table.userId),
    index('deployments_created_at_idx').on(table.createdAt),
    uniqueIndex('deployments_user_idempotency_idx').on(
      table.userId,
      table.idempotencyKey,
    ),
  ],
)

export const siteChannels = pgTable(
  'site_channels',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hostnameLabel: text('hostname_label').notNull(),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('site_channels_site_name_idx').on(table.siteId, table.name),
    uniqueIndex('site_channels_hostname_idx').on(table.hostnameLabel),
    index('site_channels_user_id_idx').on(table.userId),
    index('site_channels_deployment_id_idx').on(table.deploymentId),
  ],
)

export const customDomains = pgTable(
  'custom_domains',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    railwayDomainId: text('railway_domain_id').notNull(),
    verificationToken: text('verification_token'),
    verificationHost: text('verification_host'),
    dnsRecords: text('dns_records').default('[]').notNull(),
    certificateStatus: text('certificate_status').default('PENDING').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('custom_domains_hostname_idx').on(table.hostname),
    uniqueIndex('custom_domains_railway_id_idx').on(table.railwayDomainId),
    index('custom_domains_site_id_idx').on(table.siteId),
    index('custom_domains_user_id_idx').on(table.userId),
  ],
)

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    label: text('label').default('Webhook').notNull(),
    events: text('events').default('["*"]').notNull(),
    secretNonce: text('secret_nonce').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('webhook_endpoints_user_id_idx').on(table.userId),
    index('webhook_endpoints_active_idx').on(table.active),
  ],
)

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    event: text('event').notNull(),
    payload: text('payload').notNull(),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    responseStatus: integer('response_status'),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deliveredAt: timestamp('delivered_at'),
  },
  (table) => [
    uniqueIndex('webhook_deliveries_event_endpoint_idx').on(
      table.eventId,
      table.endpointId,
    ),
    index('webhook_deliveries_due_idx').on(table.status, table.nextAttemptAt),
    index('webhook_deliveries_user_id_idx').on(table.userId),
    index('webhook_deliveries_created_at_idx').on(table.createdAt),
  ],
)

export const siteAnalyticsDaily = pgTable(
  'site_analytics_daily',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    views: bigint('views', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('site_analytics_daily_bucket_idx').on(
      table.siteId,
      table.date,
      table.path,
      table.status,
    ),
    index('site_analytics_daily_site_date_idx').on(table.siteId, table.date),
    index('site_analytics_daily_user_id_idx').on(table.userId),
  ],
)

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    codeHint: text('code_hint').notNull(),
    label: text('label').default('General access').notNull(),
    active: boolean('active').default(true).notNull(),
    useCount: integer('use_count').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invitations_code_hash_idx').on(table.codeHash),
    index('invitations_active_idx').on(table.active),
  ],
)

export const adminEvents = pgTable(
  'admin_events',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    targetUserId: text('target_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    details: text('details'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admin_events_actor_idx').on(table.actorId),
    index('admin_events_target_user_idx').on(table.targetUserId),
    index('admin_events_created_at_idx').on(table.createdAt),
  ],
)

export const deploymentFiles = pgTable(
  'deployment_files',
  {
    id: text('id').primaryKey(),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type')
      .default('application/octet-stream')
      .notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    checksum: text('checksum'),
    etag: text('etag'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('deployment_files_path_idx').on(table.deploymentId, table.path),
    index('deployment_files_deployment_id_idx').on(table.deploymentId),
    index('deployment_files_checksum_idx').on(table.checksum),
  ],
)

export const siteRelations = relations(sites, ({ many, one }) => ({
  owner: one(user, { fields: [sites.userId], references: [user.id] }),
  deployments: many(deployments),
  customDomains: many(customDomains),
  channels: many(siteChannels),
}))

export const deploymentRelations = relations(deployments, ({ many, one }) => ({
  site: one(sites, {
    fields: [deployments.siteId],
    references: [sites.id],
  }),
  files: many(deploymentFiles),
  channels: many(siteChannels),
}))

export const siteChannelRelations = relations(siteChannels, ({ one }) => ({
  site: one(sites, {
    fields: [siteChannels.siteId],
    references: [sites.id],
  }),
  deployment: one(deployments, {
    fields: [siteChannels.deploymentId],
    references: [deployments.id],
  }),
  owner: one(user, {
    fields: [siteChannels.userId],
    references: [user.id],
  }),
}))

export const deploymentFileRelations = relations(
  deploymentFiles,
  ({ one }) => ({
    deployment: one(deployments, {
      fields: [deploymentFiles.deploymentId],
      references: [deployments.id],
    }),
  }),
)

export const customDomainRelations = relations(customDomains, ({ one }) => ({
  site: one(sites, {
    fields: [customDomains.siteId],
    references: [sites.id],
  }),
  owner: one(user, {
    fields: [customDomains.userId],
    references: [user.id],
  }),
}))

export const webhookEndpointRelations = relations(
  webhookEndpoints,
  ({ many, one }) => ({
    owner: one(user, {
      fields: [webhookEndpoints.userId],
      references: [user.id],
    }),
    deliveries: many(webhookDeliveries),
  }),
)

export const webhookDeliveryRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    endpoint: one(webhookEndpoints, {
      fields: [webhookDeliveries.endpointId],
      references: [webhookEndpoints.id],
    }),
    owner: one(user, {
      fields: [webhookDeliveries.userId],
      references: [user.id],
    }),
  }),
)

export const siteAnalyticsDailyRelations = relations(
  siteAnalyticsDaily,
  ({ one }) => ({
    site: one(sites, {
      fields: [siteAnalyticsDaily.siteId],
      references: [sites.id],
    }),
    owner: one(user, {
      fields: [siteAnalyticsDaily.userId],
      references: [user.id],
    }),
  }),
)

export const sitePreferences = pgTable(
  'site_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    favorite: boolean('favorite').default(false).notNull(),
    project: text('project').default('').notNull(),
    tags: text('tags').default('[]').notNull(),
  },
  (table) => [
    uniqueIndex('site_preferences_user_site_idx').on(
      table.userId,
      table.siteId,
    ),
  ],
)

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('workspaces_owner_idx').on(table.ownerId)],
)
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [
    uniqueIndex('workspace_members_unique_idx').on(
      table.workspaceId,
      table.userId,
    ),
    index('workspace_members_user_idx').on(table.userId),
  ],
)
export const workspaceSites = pgTable(
  'workspace_sites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('workspace_sites_site_idx').on(table.siteId),
    index('workspace_sites_workspace_idx').on(table.workspaceId),
  ],
)
export const deploymentFeedback = pgTable(
  'deployment_feedback',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    path: text('path').default('/').notNull(),
    resolved: boolean('resolved').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('deployment_feedback_page_idx').on(
      table.workspaceId,
      table.deploymentId,
      table.createdAt,
      table.id,
    ),
    index('deployment_feedback_version_idx').on(
      table.workspaceId,
      table.deploymentId,
    ),
  ],
)

export const siteHealth = pgTable(
  'site_health',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').default(false).notNull(),
    path: text('path').default('/').notNull(),
    expectedStatus: integer('expected_status').default(200).notNull(),
    nextCheckAt: timestamp('next_check_at').defaultNow().notNull(),
    checkedAt: timestamp('checked_at'),
    deploymentId: text('deployment_id'),
    responseStatus: integer('response_status'),
    latencyMs: integer('latency_ms'),
    error: text('error'),
  },
  (table) => [
    index('site_health_due_idx').on(table.enabled, table.nextCheckAt),
  ],
)

export const siteRetention = pgTable(
  'site_retention',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').default(false).notNull(),
    keepCount: integer('keep_count').default(10).notNull(),
    minAgeDays: integer('min_age_days').default(30).notNull(),
    nextRunAt: timestamp('next_run_at').defaultNow().notNull(),
    lastRunAt: timestamp('last_run_at'),
    lastDeletedCount: integer('last_deleted_count').default(0).notNull(),
    error: text('error'),
  },
  (table) => [
    index('site_retention_due_idx').on(table.enabled, table.nextRunAt),
  ],
)
export const storageCleanupJobs = pgTable(
  'storage_cleanup_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    siteId: text('site_id').notNull(),
    prefix: text('prefix').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('storage_cleanup_due_idx').on(table.nextAttemptAt),
    index('storage_cleanup_site_idx').on(table.siteId),
  ],
)
