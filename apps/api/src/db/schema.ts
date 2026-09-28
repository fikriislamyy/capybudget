import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, numeric, index, boolean, uniqueIndex, date, integer, jsonb, varchar, primaryKey, bigint } from 'drizzle-orm/pg-core';

// Better Auth's Drizzle adapter uses these four tables for sessions and identity.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
}, (table) => [
  index('session_user_id_idx').on(table.userId),
  index('session_expires_at_idx').on(table.expiresAt)
]);

export const authAccount = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index('account_user_id_idx').on(table.userId),
  uniqueIndex('account_provider_account_unique_idx').on(table.providerId, table.accountId)
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index('verification_identifier_idx').on(table.identifier),
  index('verification_expires_at_idx').on(table.expiresAt)
]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['personal', 'business'] }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [uniqueIndex('workspaces_owner_personal_unique').on(table.ownerUserId).where(sql`${table.kind} = 'personal'`)]);

export const workspaceMemberships = pgTable('workspace_memberships', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner'] }).notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] }), index('workspace_memberships_user_idx').on(table.userId)]);

// Monetary values use PostgreSQL NUMERIC to avoid floating-point rounding.
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['cash', 'bank', 'e_wallet', 'credit_card', 'savings', 'investment'] }).notNull().default('cash'),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  openingBalance: numeric('opening_balance', { precision: 19, scale: 4 }).notNull().default('0'),
  openingDate: date('opening_date').notNull().defaultNow(),
  ledgerAccountId: uuid('ledger_account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true })
}, (table) => [index('accounts_workspace_idx').on(table.workspaceId), uniqueIndex('accounts_workspace_id_unique').on(table.workspaceId, table.id)]);

export const ledgerAccounts = pgTable('ledger_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  accountClass: text('class', { enum: ['asset', 'liability', 'equity', 'income', 'expense'] }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [uniqueIndex('ledger_accounts_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('ledger_accounts_code_unique').on(table.workspaceId, table.code)]);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  parentId: uuid('parent_id'),
  ledgerAccountId: uuid('ledger_account_id').notNull(),
  icon: text('icon'), color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('categories_workspace_id_unique').on(table.workspaceId, table.id), index('categories_workspace_type_idx').on(table.workspaceId, table.type)]);

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: text('color'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('tags_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('tags_workspace_name_unique').on(table.workspaceId, table.normalizedName)]);

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accountId: uuid('account_id').notNull(),
  destinationAccountId: uuid('destination_account_id'),
  categoryId: uuid('category_id'),
  notes: text('notes'),
  merchant: text('merchant'),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
  occurredAt: date('occurred_at').notNull(),
  createdBy: text('created_by').references(() => user.id),
  updatedBy: text('updated_by').references(() => user.id),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('transactions_workspace_date_idx').on(table.workspaceId, table.occurredAt), uniqueIndex('transactions_workspace_id_unique').on(table.workspaceId, table.id)]);

export const transactionTags = pgTable('transaction_tags', {
  workspaceId: uuid('workspace_id').notNull(), transactionId: uuid('transaction_id').notNull(), tagId: uuid('tag_id').notNull()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.transactionId, table.tagId] })]);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  transactionId: uuid('transaction_id'),
  effectiveDate: date('effective_date').notNull(),
  reason: text('reason').notNull(),
  reversesEntryId: uuid('reverses_entry_id'),
  operationId: uuid('operation_id').notNull().defaultRandom(),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('journal_entries_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('journal_entries_reversal_unique').on(table.workspaceId, table.reversesEntryId)]);

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(), entryId: uuid('entry_id').notNull(),
  ledgerAccountId: uuid('ledger_account_id').notNull(),
  debit: numeric('debit', { precision: 19, scale: 4 }).notNull().default('0'),
  credit: numeric('credit', { precision: 19, scale: 4 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull()
}, (table) => [index('journal_lines_balance_idx').on(table.workspaceId, table.ledgerAccountId, table.entryId)]);

export const transactionAudit = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  actorUserId: text('actor_user_id').references(() => user.id),
  entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), action: text('action').notNull(),
  before: jsonb('before'), after: jsonb('after'), operationId: uuid('operation_id').notNull().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('audit_logs_entity_idx').on(table.workspaceId, table.entityType, table.entityId, table.createdAt)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  actorKey: text('actor_key').notNull(), operation: text('operation').notNull(), key: text('key').notNull(),
  requestHash: text('request_hash').notNull(), responseBody: jsonb('response_body'), resourceId: uuid('resource_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
}, (table) => [uniqueIndex('idempotency_key_unique').on(table.workspaceId, table.actorKey, table.operation, table.key)]);

export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(), type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
  accountId: uuid('account_id').notNull(), destinationAccountId: uuid('destination_account_id'), categoryId: uuid('category_id'),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(),
  notes: text('notes'), frequency: text('frequency', { enum: ['day', 'week', 'month', 'year'] }).notNull(),
  interval: integer('interval').notNull(), anchorDate: date('anchor_date').notNull(), timezone: text('timezone').notNull(),
  endDate: date('end_date'), nextDueDate: date('next_due_date').notNull(), nextOccurrenceIndex: integer('next_occurrence_index').notNull().default(0),
  mode: text('mode', { enum: ['manual', 'auto'] }).notNull().default('manual'), status: text('status', { enum: ['active', 'paused', 'archived'] }).notNull().default('active'),
  version: integer('version').notNull().default(1), createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('recurring_rules_workspace_due_idx').on(table.workspaceId, table.status, table.nextDueDate)]);

export const recurringOccurrences = pgTable('recurring_occurrences', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  ruleId: uuid('rule_id').notNull().references(() => recurringRules.id), scheduledDate: date('scheduled_date').notNull(),
  ruleVersion: integer('rule_version').notNull(), templateSnapshot: jsonb('template_snapshot').notNull(),
  status: text('status', { enum: ['pending', 'posted', 'skipped', 'failed'] }).notNull().default('pending'),
  transactionId: uuid('transaction_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('recurring_occurrence_date_unique').on(table.workspaceId, table.ruleId, table.scheduledDate)]);

export const budgets = pgTable('budgets', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  categoryId: uuid('category_id').notNull(), name: text('name').notNull(), cadence: text('cadence', { enum: ['weekly', 'monthly'] }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(),
  startsOn: date('starts_on').notNull(), alertThresholds: jsonb('alert_thresholds').notNull().default([80, 100]),
  createdBy: text('created_by').references(() => user.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [index('budgets_workspace_idx').on(table.workspaceId), uniqueIndex('budgets_workspace_id_unique').on(table.workspaceId, table.id)]);

export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(), targetAmount: numeric('target_amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(),
  targetDate: date('target_date'), linkedAccountId: uuid('linked_account_id'), createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [index('savings_goals_workspace_idx').on(table.workspaceId), uniqueIndex('savings_goals_workspace_id_unique').on(table.workspaceId, table.id)]);

export const goalContributions = pgTable('goal_contributions', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  goalId: uuid('goal_id').notNull(), direction: text('direction', { enum: ['add', 'withdraw'] }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), occurredOn: date('occurred_on').notNull(),
  note: text('note'), createdBy: text('created_by').references(() => user.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('goal_contributions_goal_idx').on(table.workspaceId, table.goalId, table.occurredOn)]);

export const bills = pgTable('bills', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(),
  categoryId: uuid('category_id'), frequency: text('frequency', { enum: ['once', 'week', 'month', 'year'] }).notNull(), interval: integer('interval').notNull().default(1),
  anchorDate: date('anchor_date').notNull(), nextDueDate: date('next_due_date').notNull(), endDate: date('end_date'),
  reminderDays: integer('reminder_days').array().notNull().default([3, 0]), enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by').references(() => user.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [index('bills_due_idx').on(table.workspaceId, table.enabled, table.nextDueDate), uniqueIndex('bills_workspace_id_unique').on(table.workspaceId, table.id)]);

export const billOccurrences = pgTable('bill_occurrences', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), billId: uuid('bill_id').notNull(),
  dueOn: date('due_on').notNull(), name: text('name').notNull(), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(), status: text('status', { enum: ['unpaid', 'paid', 'skipped'] }).notNull().default('unpaid'),
  paidAt: timestamp('paid_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('bill_occurrence_due_unique').on(table.workspaceId, table.billId, table.dueOn), index('bill_occurrence_upcoming_idx').on(table.workspaceId, table.dueOn, table.status)]);

export const financeNotifications = pgTable('finance_notifications', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id').notNull().references(() => user.id), kind: text('kind').notNull(), sourceId: uuid('source_id').notNull(),
  dedupeKey: text('dedupe_key').notNull(), title: text('title').notNull(), message: text('message').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }), emailSentAt: timestamp('email_sent_at', { withTimezone: true }), pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('finance_notifications_dedupe_unique').on(table.workspaceId, table.userId, table.dedupeKey), index('finance_notifications_user_idx').on(table.userId, table.readAt, table.createdAt)]);

export const financeNotificationPreferences = pgTable('finance_notification_preferences', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), userId: text('user_id').notNull().references(() => user.id),
  eventType: text('event_type').notNull(), channel: text('channel', { enum: ['email','push'] }).notNull(), enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.eventType, table.channel] })]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id').notNull().references(() => user.id), endpoint: text('endpoint').notNull(), p256dh: text('p256dh').notNull(), auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('push_subscriptions_endpoint_unique').on(table.workspaceId,table.userId,table.endpoint), index('push_subscriptions_user_idx').on(table.workspaceId,table.userId)]);

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  transactionId: uuid('transaction_id').notNull(), objectKey: text('object_key').notNull().unique(), originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(), sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(), checksum: text('checksum').notNull(),
  status: text('status', { enum: ['pending', 'ready', 'rejected'] }).notNull(), uploadedBy: text('uploaded_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { withTimezone: true })
}, (table) => [index('attachments_transaction_idx').on(table.workspaceId, table.transactionId, table.status)]);
