import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, numeric, index, boolean, uniqueIndex, date, integer, jsonb, varchar, primaryKey, bigint, foreignKey } from 'drizzle-orm/pg-core';

// Better Auth's Drizzle adapter uses these four tables for sessions and identity.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  accountStatus: text('account_status').notNull().default('active'),
  securityVersion: integer('security_version').notNull().default(1),
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
  baseAmount: numeric('base_amount', {precision:19,scale:4}),
  baseCurrency: varchar('base_currency',{length:3}),
  destinationAmount: numeric('destination_amount',{precision:19,scale:4}),
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
  currency: varchar('currency', { length: 3 }).notNull(),
  baseDebit: numeric('base_debit',{precision:19,scale:4}),
  baseCredit: numeric('base_credit',{precision:19,scale:4})
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
  alertRevision: integer('alert_revision').notNull().default(1),
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
  paymentAccountId: uuid('payment_account_id'), recurringRuleId: uuid('recurring_rule_id'),
  expectedPaymentOffsetDays: integer('expected_payment_offset_days'), deferrableOffsetDays: integer('deferrable_offset_days'),
  reminderDays: integer('reminder_days').array().notNull().default([3, 0]), enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by').references(() => user.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [index('bills_due_idx').on(table.workspaceId, table.enabled, table.nextDueDate), uniqueIndex('bills_workspace_id_unique').on(table.workspaceId, table.id)]);

export const billGroupForecastSettings = pgTable('bill_group_forecast_settings', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), dueDay: integer('due_day').notNull(), paymentAccountId: uuid('payment_account_id'),
  hasPaymentAccount: boolean('has_payment_account').notNull().default(false),
  expectedPaymentOffsetDays: integer('expected_payment_offset_days'), hasExpectedOffset: boolean('has_expected_offset').notNull().default(false),
  deferrableOffsetDays: integer('deferrable_offset_days'), hasDeferrableOffset: boolean('has_deferrable_offset').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.name, table.dueDay] }),
  foreignKey({ columns: [table.workspaceId, table.paymentAccountId], foreignColumns: [accounts.workspaceId, accounts.id] })]);

export const billOccurrences = pgTable('bill_occurrences', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), billId: uuid('bill_id').notNull(),
  dueOn: date('due_on').notNull(), name: text('name').notNull(), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(), status: text('status', { enum: ['unpaid', 'paid', 'skipped'] }).notNull().default('unpaid'),
  transactionId: uuid('transaction_id'), paymentAccountId: uuid('payment_account_id'), expectedPaymentOn: date('expected_payment_on'), deferrableUntil: date('deferrable_until'),
  paidAt: timestamp('paid_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('bill_occurrence_due_unique').on(table.workspaceId, table.billId, table.dueOn), index('bill_occurrence_upcoming_idx').on(table.workspaceId, table.dueOn, table.status)]);

export const financeNotifications = pgTable('finance_notifications', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), kind: text('kind').notNull(), sourceId: uuid('source_id').notNull(),
  dedupeKey: text('dedupe_key').notNull(), title: text('title').notNull(), message: text('message').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }), emailSentAt: timestamp('email_sent_at', { withTimezone: true }), pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }), assistantSuggestionId: uuid('assistant_suggestion_id'),
  sourceType: text('source_type').notNull().default('legacy'), sourceRevision: text('source_revision'), ruleVersion: text('rule_version'),
  messageKey: text('message_key').notNull().default('legacy'), messageParams: jsonb('message_params').notNull().default({}), evidence: jsonb('evidence').notNull().default({}),
  severity: text('severity', { enum: ['info','attention','urgent'] }).notNull().default('attention'), actionType: text('action_type'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }), snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now()+interval '90 days'`), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolutionReason: text('resolution_reason'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('finance_notifications_dedupe_unique').on(table.workspaceId, table.userId, table.dedupeKey), uniqueIndex('finance_notifications_workspace_user_id_unique').on(table.workspaceId,table.userId,table.id), index('finance_notifications_user_idx').on(table.userId, table.readAt, table.createdAt), index('finance_notifications_active_idx').on(table.workspaceId, table.userId, table.resolvedAt, table.createdAt), index('finance_notifications_cursor_idx').on(table.workspaceId,table.userId,table.createdAt,table.id), index('finance_notifications_unread_active_idx').on(table.workspaceId,table.userId,table.createdAt,table.id).where(sql`${table.readAt} IS NULL AND ${table.resolvedAt} IS NULL AND ${table.dismissedAt} IS NULL`)]);

export const financeNotificationPreferences = pgTable('finance_notification_preferences', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), channel: text('channel', { enum: ['email','push','in_app'] }).notNull(), enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.eventType, table.channel] })]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  securityDeviceId: uuid('security_device_id').references(() => securityDevices.id,{onDelete:'cascade'}),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), endpoint: text('endpoint').notNull(), p256dh: text('p256dh').notNull(), auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('push_subscriptions_endpoint_unique').on(table.workspaceId,table.userId,table.endpoint), uniqueIndex('push_subscriptions_workspace_id_unique').on(table.workspaceId,table.id), index('push_subscriptions_user_idx').on(table.workspaceId,table.userId)]);

export const financeNotificationRules = pgTable('finance_notification_rules', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id,{onDelete:'cascade'}), userId: text('user_id').notNull().references(() => user.id,{onDelete:'cascade'}),
  ruleType: text('rule_type').notNull(), scopeKey: text('scope_key').notNull(), accountId: uuid('account_id'), categoryId: uuid('category_id'), currency: varchar('currency',{length:3}),
  enabled: boolean('enabled').notNull().default(false), parameters: jsonb('parameters').notNull().default({}), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
},(table)=>[uniqueIndex('finance_notification_rules_scope_unique').on(table.workspaceId,table.userId,table.ruleType,table.scopeKey),uniqueIndex('finance_notification_rules_workspace_id_unique').on(table.workspaceId,table.id),foreignKey({columns:[table.workspaceId,table.accountId],foreignColumns:[accounts.workspaceId,accounts.id]}).onDelete('cascade'),foreignKey({columns:[table.workspaceId,table.categoryId],foreignColumns:[categories.workspaceId,categories.id]}).onDelete('cascade'),index('finance_notification_rules_actor_idx').on(table.workspaceId,table.userId,table.enabled,table.ruleType)]);

export const financeNotificationEvaluationState = pgTable('finance_notification_evaluation_state', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(()=>workspaces.id,{onDelete:'cascade'}), userId: text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  ruleKey: text('rule_key').notNull(), scopeKey: text('scope_key').notNull(), periodKey: text('period_key').notNull(), ruleVersion: text('rule_version').notNull().default('1'), sourceVersion: text('source_version'),
  dirtyVersion: bigint('dirty_version',{mode:'number'}).notNull().default(1), processedVersion: bigint('processed_version',{mode:'number'}).notNull().default(0), cursor: jsonb('cursor'),
  state: jsonb('state').notNull().default({}), nextEvaluationAt: timestamp('next_evaluation_at',{withTimezone:true}).notNull().defaultNow(), leaseExpiresAt: timestamp('lease_expires_at',{withTimezone:true}),
  attempts: integer('attempts').notNull().default(0), lastErrorCode: text('last_error_code'), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
},(table)=>[uniqueIndex('finance_notification_evaluation_scope_unique').on(table.workspaceId,table.userId,table.ruleKey,table.scopeKey,table.periodKey),index('finance_notification_evaluation_due_idx').on(table.nextEvaluationAt,table.leaseExpiresAt).where(sql`${table.dirtyVersion}>${table.processedVersion}`)]);

export const financeNotificationDeliveries = pgTable('finance_notification_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(()=>workspaces.id,{onDelete:'cascade'}), userId: text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  notificationId: uuid('notification_id').notNull(), channel: text('channel').notNull(), destinationKey: text('destination_key').notNull(), pushSubscriptionId: uuid('push_subscription_id'),
  generation: integer('generation').notNull().default(1), preferenceVersion: integer('preference_version').notNull().default(1), status: text('status').notNull().default('pending'), attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at',{withTimezone:true}).notNull().defaultNow(), expiresAt: timestamp('expires_at',{withTimezone:true}).notNull().default(sql`now()+interval '7 days'`),
  leaseExpiresAt: timestamp('lease_expires_at',{withTimezone:true}), sendStartedAt: timestamp('send_started_at',{withTimezone:true}), providerMessageId: text('provider_message_id'), lastErrorCode: text('last_error_code'),
  acceptedAt: timestamp('accepted_at',{withTimezone:true}), deliveredAt: timestamp('delivered_at',{withTimezone:true}), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
},(table)=>[uniqueIndex('finance_notification_deliveries_destination_unique').on(table.workspaceId,table.userId,table.notificationId,table.channel,table.destinationKey,table.generation),uniqueIndex('finance_notification_deliveries_workspace_id_unique').on(table.workspaceId,table.id),foreignKey({columns:[table.workspaceId,table.userId,table.notificationId],foreignColumns:[financeNotifications.workspaceId,financeNotifications.userId,financeNotifications.id]}).onDelete('cascade'),foreignKey({columns:[table.workspaceId,table.pushSubscriptionId],foreignColumns:[pushSubscriptions.workspaceId,pushSubscriptions.id]}).onDelete('cascade'),index('finance_notification_delivery_due_idx').on(table.status,table.availableAt,table.createdAt),index('finance_notification_delivery_lease_idx').on(table.leaseExpiresAt).where(sql`${table.status}='processing'`)]);

export const businessProfiles = pgTable('business_profiles', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  legalName: text('legal_name').notNull(), tradingName: text('trading_name'), address: jsonb('address').notNull().default({}),
  contactEmail: text('contact_email'), phone: text('phone'), taxId: text('tax_id'), logoDocumentId: uuid('logo_document_id'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1), fiscalYearStartDay: integer('fiscal_year_start_day').notNull().default(1),
  version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const invoiceNumberSequences = pgTable('invoice_number_sequences', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  series: text('series').notNull().default('INV'), nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1)
}, (table) => [primaryKey({ columns: [table.workspaceId, table.series] })]);

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  number: text('number'), state: text('state', { enum: ['draft', 'issued', 'void'] }).notNull().default('draft'),
  issueDate: date('issue_date').notNull(), dueDate: date('due_date').notNull(), expectedPaymentOn: date('expected_payment_on'), expectedAccountId: uuid('expected_account_id'), currency: varchar('currency', { length: 3 }).notNull(), currencyScale: integer('currency_scale').notNull().default(2),
  sellerSnapshot: jsonb('seller_snapshot'), recipientSnapshot: jsonb('recipient_snapshot').notNull(), locale: text('locale').notNull().default('en'),
  notes: text('notes'), paymentInstructions: text('payment_instructions'), subtotal: numeric('subtotal', { precision: 19, scale: 4 }).notNull().default('0'),
  discountTotal: numeric('discount_total', { precision: 19, scale: 4 }).notNull().default('0'), taxTotal: numeric('tax_total', { precision: 19, scale: 4 }).notNull().default('0'),
  total: numeric('total', { precision: 19, scale: 4 }).notNull().default('0'), issuedAt: timestamp('issued_at', { withTimezone: true }), firstSentAt: timestamp('first_sent_at', { withTimezone: true }),
  voidedAt: timestamp('voided_at', { withTimezone: true }), voidEffectiveOn: date('void_effective_on'), voidReason: text('void_reason'),
  version: integer('version').notNull().default(1), createdBy: text('created_by').references(() => user.id), updatedBy: text('updated_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), archivedAt: timestamp('archived_at', { withTimezone: true })
}, (table) => [uniqueIndex('invoices_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('invoices_number_unique').on(table.workspaceId, table.number), index('invoices_workspace_due_idx').on(table.workspaceId, table.state, table.dueDate)]);

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), invoiceId: uuid('invoice_id').notNull(), position: integer('position').notNull(),
  description: text('description').notNull(), quantity: numeric('quantity', { precision: 19, scale: 4 }).notNull(), unitPrice: numeric('unit_price', { precision: 19, scale: 4 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 19, scale: 4 }).notNull().default('0'), taxRate: numeric('tax_rate', { precision: 7, scale: 4 }).notNull().default('0'),
  netAmount: numeric('net_amount', { precision: 19, scale: 4 }).notNull(), taxAmount: numeric('tax_amount', { precision: 19, scale: 4 }).notNull(), totalAmount: numeric('total_amount', { precision: 19, scale: 4 }).notNull()
}, (table) => [uniqueIndex('invoice_lines_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('invoice_lines_position_unique').on(table.workspaceId, table.invoiceId, table.position)]);

export const businessDocuments = pgTable('business_documents', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), invoiceId: uuid('invoice_id'),
  kind: text('kind', { enum: ['logo', 'invoice_pdf'] }).notNull(), sourceVersion: integer('source_version'), templateVersion: integer('template_version').notNull().default(1),
  objectKey: text('object_key').notNull().unique(), mimeType: text('mime_type').notNull(), byteSize: bigint('byte_size', { mode: 'number' }), checksum: text('checksum'),
  state: text('state', { enum: ['pending', 'ready', 'failed'] }).notNull().default('pending'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('business_documents_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('business_documents_pdf_version_unique').on(table.workspaceId, table.invoiceId, table.sourceVersion, table.templateVersion)]);

export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), invoiceId: uuid('invoice_id').notNull(), transactionId: uuid('transaction_id').notNull(),
  accountId: uuid('account_id').notNull(), categoryId: uuid('category_id').notNull(), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(),
  paidOn: date('paid_on').notNull(), reference: text('reference'), createdBy: text('created_by').references(() => user.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp('reversed_at', { withTimezone: true }), reversedBy: text('reversed_by').references(() => user.id), reversalReason: text('reversal_reason'), reversalEffectiveOn: date('reversal_effective_on')
}, (table) => [uniqueIndex('invoice_payments_transaction_unique').on(table.workspaceId, table.transactionId), index('invoice_payments_invoice_idx').on(table.workspaceId, table.invoiceId, table.paidOn)]);

export const invoiceDeliveries = pgTable('invoice_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), invoiceId: uuid('invoice_id').notNull(), documentId: uuid('document_id'),
  purpose: text('purpose', { enum: ['invoice','reminder'] }).notNull().default('invoice'), reminderMessageSnapshot: text('reminder_message_snapshot'),
  requestedBy: text('requested_by').notNull().references(() => user.id), recipientSnapshot: text('recipient_snapshot').notNull(), locale: text('locale').notNull(),
  state: text('state', { enum: ['pending', 'queued', 'sending', 'accepted', 'failed', 'cancelled', 'uncertain'] }).notNull().default('pending'), attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(), leaseUntil: timestamp('lease_until', { withTimezone: true }), acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  providerMessageId: text('provider_message_id'), errorCode: text('error_code'), idempotencyKey: text('idempotency_key').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('invoice_deliveries_idempotency_unique').on(table.workspaceId, table.idempotencyKey), index('invoice_deliveries_pending_idx').on(table.state, table.nextAttemptAt), index('invoice_deliveries_purpose_idx').on(table.workspaceId, table.purpose, table.state, table.nextAttemptAt)]);

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  transactionId: uuid('transaction_id').notNull(), objectKey: text('object_key').notNull().unique(), originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(), sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(), checksum: text('checksum').notNull(),
  status: text('status', { enum: ['pending', 'ready', 'rejected'] }).notNull(), uploadedBy: text('uploaded_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { withTimezone: true })
}, (table) => [index('attachments_transaction_idx').on(table.workspaceId, table.transactionId, table.status)]);

export const assistantSettings = pgTable('assistant_settings', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  localForecastEnabled: boolean('local_forecast_enabled').notNull().default(true), suggestionsEnabled: boolean('suggestions_enabled').notNull().default(true), categorizationEnabled: boolean('categorization_enabled').notNull().default(true), externalAiEnabled: boolean('external_ai_enabled').notNull().default(false),
  sourcePermissions: jsonb('source_permissions').notNull().default({ history: true, recurring: true, bills: true, invoices: true, budgets: true, goals: true, merchant: false, notes: false }), tone: text('tone').notNull().default('balanced'), locale: text('locale').notNull().default('en'), defaultHorizonDays: integer('default_horizon_days').notNull().default(30), safetyBuffer: numeric('safety_buffer', { precision: 19, scale: 4 }).notNull().default('0'), consentVersion: integer('consent_version').notNull().default(1), consentedAt: timestamp('consented_at', { withTimezone: true }), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]);

export const assistantRefreshState = pgTable('assistant_refresh_state', {
  workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(), lastInputHash: text('last_input_hash')
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] }), foreignKey({ columns: [table.workspaceId, table.userId], foreignColumns: [assistantSettings.workspaceId, assistantSettings.userId] }).onDelete('cascade'), index('assistant_refresh_due_idx').on(table.checkedAt)]);

export const assistantAccountSettings = pgTable('assistant_account_settings', {
  workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), accountId: uuid('account_id').notNull(), includeInForecast: boolean('include_in_forecast').notNull().default(true), allowExternalAi: boolean('allow_external_ai').notNull().default(false), lowBalanceThreshold: numeric('low_balance_threshold', { precision: 19, scale: 4 }).notNull().default('0'), protectedAmount: numeric('protected_amount', { precision: 19, scale: 4 }).notNull().default('0'), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.accountId] }), foreignKey({ columns: [table.workspaceId, table.accountId], foreignColumns: [accounts.workspaceId, accounts.id] })]);

export const forecastTransactionOverrides = pgTable('forecast_transaction_overrides', {
  workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), transactionId: uuid('transaction_id').notNull(), excludeFromBaseline: boolean('exclude_from_baseline').notNull().default(false), reason: text('reason'), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.transactionId] }), foreignKey({ columns: [table.workspaceId, table.transactionId], foreignColumns: [transactions.workspaceId, transactions.id] })]);

export const forecastRuns = pgTable('forecast_runs', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), requestKey: text('request_key'), asOfDate: date('as_of_date').notNull(), snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(), horizonDays: integer('horizon_days').notNull(), currency: varchar('currency', { length: 3 }).notNull(), engineVersion: text('engine_version').notNull(), consentVersion: integer('consent_version').notNull(), scopeHash: text('scope_hash').notNull(), inputHash: text('input_hash').notNull(), inputSnapshot: jsonb('input_snapshot').notNull(), status: text('status').notNull().default('ready'), qualityFlags: jsonb('quality_flags').notNull().default([]), summary: jsonb('summary').notNull().default({}), requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp('completed_at', { withTimezone: true }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), leaseUntil: timestamp('lease_until', { withTimezone: true }), attempts: integer('attempts').notNull().default(0), errorCode: text('error_code')
}, (table) => [uniqueIndex('forecast_runs_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('forecast_runs_request_key_unique').on(table.workspaceId, table.userId, table.requestKey), uniqueIndex('forecast_runs_active_snapshot_unique').on(table.workspaceId, table.userId, table.asOfDate, table.horizonDays, table.consentVersion, table.scopeHash, table.inputHash).where(sql`${table.status} in ('queued','running')`), uniqueIndex('forecast_runs_ready_snapshot_unique').on(table.workspaceId, table.userId, table.asOfDate, table.horizonDays, table.consentVersion, table.scopeHash, table.inputHash).where(sql`${table.status}='ready'`), foreignKey({ columns: [table.workspaceId, table.userId], foreignColumns: [assistantSettings.workspaceId, assistantSettings.userId] }), index('forecast_runs_latest_idx').on(table.workspaceId, table.userId, table.asOfDate, table.horizonDays, table.requestedAt)]);

export const forecastEvents = pgTable('forecast_events', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), runId: uuid('run_id').notNull(), accountId: uuid('account_id'), eventKey: text('event_key').notNull(), eventDate: date('event_date').notNull(), sourceType: text('source_type').notNull(), sourceId: uuid('source_id'), sourceVersion: integer('source_version'), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(), certainty: text('certainty').notNull(), scenarioInclusion: text('scenario_inclusion').notNull().default('both'), description: text('description').notNull(), evidence: jsonb('evidence').notNull().default({})
}, (table) => [uniqueIndex('forecast_events_run_key_unique').on(table.workspaceId, table.runId, table.eventKey), foreignKey({ columns: [table.workspaceId, table.runId], foreignColumns: [forecastRuns.workspaceId, forecastRuns.id] }), index('forecast_events_date_idx').on(table.workspaceId, table.userId, table.runId, table.eventDate)]);

export const forecastDailyBalances = pgTable('forecast_daily_balances', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), runId: uuid('run_id').notNull(), scopeKey: text('scope_key').notNull(), accountId: uuid('account_id'), date: date('date').notNull(), scenario: text('scenario').notNull(), openingBalance: numeric('opening_balance', { precision: 19, scale: 4 }).notNull(), inflows: numeric('inflows', { precision: 19, scale: 4 }).notNull(), outflows: numeric('outflows', { precision: 19, scale: 4 }).notNull(), closingBalance: numeric('closing_balance', { precision: 19, scale: 4 }).notNull(), minimumBalance: numeric('minimum_balance', { precision: 19, scale: 4 }).notNull(), protectedAmount: numeric('protected_amount', { precision: 19, scale: 4 }).notNull(), headroom: numeric('headroom', { precision: 19, scale: 4 }).notNull()
}, (table) => [uniqueIndex('forecast_daily_balances_scope_unique').on(table.workspaceId, table.runId, table.scopeKey, table.date, table.scenario), foreignKey({ columns: [table.workspaceId, table.runId], foreignColumns: [forecastRuns.workspaceId, forecastRuns.id] }), index('forecast_daily_balance_lookup_idx').on(table.workspaceId, table.userId, table.runId, table.scopeKey, table.date)]);

export const assistantSuggestions = pgTable('assistant_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), runId: uuid('run_id'), kind: text('kind').notNull(), fingerprint: text('fingerprint').notNull(), templateKey: text('template_key').notNull(), facts: jsonb('facts').notNull().default({}), reasonCodes: jsonb('reason_codes').notNull().default([]), evidence: jsonb('evidence').notNull().default([]), wording: text('wording'), priority: integer('priority').notNull().default(0), state: text('state').notNull().default('active'), snoozedUntil: timestamp('snoozed_until', { withTimezone: true }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), helpfulness: text('helpfulness'), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('assistant_suggestions_fingerprint_unique').on(table.workspaceId, table.userId, table.fingerprint), uniqueIndex('assistant_suggestions_workspace_id_unique').on(table.workspaceId, table.id), foreignKey({ columns: [table.workspaceId, table.runId], foreignColumns: [forecastRuns.workspaceId, forecastRuns.id] }), index('assistant_suggestions_state_idx').on(table.workspaceId, table.userId, table.state, table.priority, table.createdAt)]);

export const assistantActionProposals = pgTable('assistant_action_proposals', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), suggestionId: uuid('suggestion_id'), actionType: text('action_type').notNull(), payload: jsonb('payload').notNull(), sourceVersions: jsonb('source_versions').notNull().default({}), payloadHash: text('payload_hash').notNull(), consentVersion: integer('consent_version').notNull(), state: text('state').notNull().default('proposed'), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), confirmedAt: timestamp('confirmed_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }), resultType: text('result_type'), resultId: uuid('result_id'), idempotencyKey: text('idempotency_key').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('assistant_action_proposals_idempotency_unique').on(table.workspaceId, table.userId, table.idempotencyKey), foreignKey({ columns: [table.workspaceId, table.suggestionId], foreignColumns: [assistantSuggestions.workspaceId, assistantSuggestions.id] })]);

export const categoryRules = pgTable('category_rules', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), transactionType: text('transaction_type').notNull(), matcherType: text('matcher_type').notNull(), normalizedMatch: text('normalized_match').notNull(), categoryId: uuid('category_id').notNull(), origin: text('origin').notNull(), supportCount: integer('support_count').notNull().default(0), acceptedCount: integer('accepted_count').notNull().default(0), rejectedCount: integer('rejected_count').notNull().default(0), enabled: boolean('enabled').notNull().default(true), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('category_rules_match_unique').on(table.workspaceId, table.userId, table.transactionType, table.matcherType, table.normalizedMatch), foreignKey({ columns: [table.workspaceId, table.categoryId], foreignColumns: [categories.workspaceId, categories.id] }), index('category_rules_lookup_idx').on(table.workspaceId, table.userId, table.transactionType, table.enabled)]);

export const categoryFeedback = pgTable('category_feedback', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), transactionId: uuid('transaction_id').notNull(), transactionVersion: integer('transaction_version').notNull(), previousCategoryId: uuid('previous_category_id'), chosenCategoryId: uuid('chosen_category_id'), normalizedMerchant: text('normalized_merchant').notNull().default(''), predictionSource: text('prediction_source').notNull(), ruleId: uuid('rule_id'), invocationId: uuid('invocation_id'), decision: text('decision').notNull(), consentVersion: integer('consent_version').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('category_feedback_transaction_version_unique').on(table.workspaceId, table.userId, table.transactionId, table.transactionVersion), foreignKey({ columns: [table.workspaceId, table.transactionId], foreignColumns: [transactions.workspaceId, transactions.id] })]);

export const aiInvocations = pgTable('ai_invocations', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), userId: text('user_id').notNull(), feature: text('feature').notNull(), provider: text('provider').notNull(), model: text('model'), promptVersion: text('prompt_version').notNull(), consentVersion: integer('consent_version').notNull(), scopeHash: text('scope_hash').notNull(), inputHash: text('input_hash').notNull(), requestKey: text('request_key').notNull(), status: text('status').notNull(), reservedUnits: integer('reserved_units').notNull().default(0), inputTokens: integer('input_tokens'), outputTokens: integer('output_tokens'), latencyMs: integer('latency_ms'), errorCode: text('error_code'), validatedResult: jsonb('validated_result'), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('ai_invocations_request_unique').on(table.workspaceId, table.userId, table.requestKey)]);

export const budgetRevisions = pgTable('budget_revisions', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), budgetId: uuid('budget_id').notNull(), revision: integer('revision').notNull().default(1), cadence: text('cadence').notNull(), amount: numeric('amount', { precision: 19, scale: 4 }).notNull(), currency: varchar('currency', { length: 3 }).notNull(), categoryId: uuid('category_id').notNull(), name: text('name').notNull(), validFrom: date('valid_from').notNull(), validTo: date('valid_to'), archived: boolean('archived').notNull().default(false), legacyBaseline: boolean('legacy_baseline').notNull().default(false), recordedBy: text('recorded_by').references(() => user.id), recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('budget_revisions_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('budget_revisions_number_unique').on(table.workspaceId, table.budgetId, table.revision), foreignKey({ columns: [table.workspaceId, table.budgetId], foreignColumns: [budgets.workspaceId, budgets.id] }), foreignKey({ columns: [table.workspaceId, table.categoryId], foreignColumns: [categories.workspaceId, categories.id] }), index('budget_revisions_period_idx').on(table.workspaceId, table.budgetId, table.validFrom, table.validTo)]);

export const cashflowCategoryMappings = pgTable('cashflow_category_mappings', {
  workspaceId: uuid('workspace_id').notNull(), categoryId: uuid('category_id').notNull(), activity: text('activity').notNull(), version: integer('version').notNull().default(1), updatedBy: text('updated_by').references(() => user.id), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.workspaceId, table.categoryId] }), foreignKey({ columns: [table.workspaceId, table.categoryId], foreignColumns: [categories.workspaceId, categories.id] })]);

export const reportRuns = pgTable('report_runs', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), requestedBy: text('requested_by').notNull().references(() => user.id, { onDelete: 'cascade' }), reportType: text('report_type').notNull(), preset: text('preset').notNull(), parameters: jsonb('parameters').notNull().default({}), requestKey: text('request_key').notNull(), reportVersion: text('report_version').notNull().default('reports-v1'), status: text('status').notNull().default('ready'), attempts: integer('attempts').notNull().default(0), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }), failureCode: text('failure_code'), generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(), periodFrom: date('period_from').notNull(), periodToExclusive: date('period_to_exclusive').notNull(), timezone: text('timezone').notNull(), currency: varchar('currency', { length: 3 }).notNull(), summary: jsonb('summary').notNull().default({}), qualityFlags: jsonb('quality_flags').notNull().default([]), contentHash: text('content_hash').notNull(), rowCount: integer('row_count').notNull().default(0), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now()+interval '7 days'`)
}, (table) => [uniqueIndex('report_runs_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('report_runs_request_key_unique').on(table.workspaceId, table.requestedBy, table.requestKey), index('report_runs_owner_idx').on(table.workspaceId, table.requestedBy, table.generatedAt), index('report_runs_expiry_idx').on(table.expiresAt), index('report_runs_recovery_idx').on(table.status, table.leaseExpiresAt, table.generatedAt)]);

export const reportRows = pgTable('report_rows', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), runId: uuid('run_id').notNull(), requestedBy: text('requested_by').notNull().references(() => user.id, { onDelete: 'cascade' }), section: text('section').notNull(), rowNumber: integer('row_number').notNull(), rowData: jsonb('row_data').notNull()
}, (table) => [uniqueIndex('report_rows_run_section_order_unique').on(table.workspaceId, table.runId, table.section, table.rowNumber), foreignKey({ columns: [table.workspaceId, table.runId], foreignColumns: [reportRuns.workspaceId, reportRuns.id] }).onDelete('cascade'), index('report_rows_page_idx').on(table.workspaceId, table.requestedBy, table.runId, table.section, table.rowNumber)]);

export const reportExports = pgTable('report_exports', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull(), runId: uuid('run_id').notNull(), requestedBy: text('requested_by').notNull().references(() => user.id, { onDelete: 'cascade' }), format: text('format').notNull(), requestKey: text('request_key').notNull(), status: text('status').notNull().default('queued'), attempts: integer('attempts').notNull().default(0), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }), objectKey: text('object_key'), checksum: text('checksum'), byteCount: bigint('byte_count', { mode: 'number' }), failureCode: text('failure_code'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), readyAt: timestamp('ready_at', { withTimezone: true }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now()+interval '7 days'`)
}, (table) => [uniqueIndex('report_exports_workspace_id_unique').on(table.workspaceId, table.id), uniqueIndex('report_exports_request_key_unique').on(table.workspaceId, table.requestedBy, table.runId, table.requestKey), foreignKey({ columns: [table.workspaceId, table.runId], foreignColumns: [reportRuns.workspaceId, reportRuns.id] }).onDelete('cascade'), index('report_exports_recovery_idx').on(table.status, table.leaseExpiresAt, table.createdAt), index('report_exports_owner_idx').on(table.workspaceId, table.requestedBy, table.createdAt)]);

export const reportExportCleanup = pgTable('report_export_cleanup', {
  objectKey: text('object_key').primaryKey(), queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(), attempts: integer('attempts').notNull().default(0), lastError: text('last_error')
});

// Better Auth owns factor secrets and recovery material; the plugin encrypts them.
export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(), backupCodes: text('backup_codes').notNull(),
  verified: boolean('verified').notNull().default(false),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true })
}, table => [uniqueIndex('two_factor_user_unique').on(table.userId)]);
export const securityDevices = pgTable('security_devices', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tokenDigest: text('token_digest').unique(),
  label: text('label').notNull(), pinHash: text('pin_hash'), lockEnabled: boolean('lock_enabled').notNull().default(false),
  failures: integer('failures').notNull().default(0), cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), revokedAt: timestamp('revoked_at', { withTimezone: true })
});
export const sessionSecurity = pgTable('session_security', {
  sessionId: text('session_id').primaryKey().references(() => session.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => securityDevices.id, { onDelete: 'cascade' }),
  lockedAt: timestamp('locked_at', { withTimezone: true }), unlockedUntil: timestamp('unlocked_until', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow()
});
export const securityChallenges = pgTable('security_challenges', {
  id: uuid('id').defaultRandom().primaryKey(), sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(), value: text('value').notNull(), securityVersion: integer('security_version').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), consumedAt: timestamp('consumed_at', { withTimezone: true })
});
export const webauthnCredentials = pgTable('webauthn_credentials', {
  id: text('id').primaryKey(), deviceId: uuid('device_id').notNull().references(() => securityDevices.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(), counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: jsonb('transports').notNull().default([]), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
export const securityEvents = pgTable('security_events', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), outcome: text('outcome').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
export const factorReplays = pgTable('factor_replays', {
  digest: text('digest').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const userSecuritySettings = pgTable('user_security_settings', {
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}), privacyDefault:boolean('privacy_default').notNull().default(false), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
});
export const privacyExports = pgTable('privacy_exports', {
 id:uuid('id').defaultRandom().primaryKey(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),requestKey:text('request_key').notNull(),status:text('status').notNull().default('queued'),securityVersion:integer('security_version').notNull(),objectKey:text('object_key'),checksum:text('checksum'),byteCount:bigint('byte_count',{mode:'number'}),attempts:integer('attempts').notNull().default(0),leaseUntil:timestamp('lease_until',{withTimezone:true}),failureCode:text('failure_code'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull().default(sql`now()+interval '24 hours'`)
},t=>[uniqueIndex('privacy_exports_user_request_unique').on(t.userId,t.requestKey),index('privacy_exports_work_idx').on(t.status,t.leaseUntil,t.expiresAt)]);
export const accountDeletionRequests = pgTable('account_deletion_requests', {
 id:uuid('id').defaultRandom().primaryKey(),userId:text('user_id').references(()=>user.id,{onDelete:'set null'}),subjectId:text('subject_id').notNull().unique(),status:text('status').notNull().default('quarantined'),receiptDigest:text('receipt_digest').notNull(),manifest:jsonb('manifest').notNull(),workspaceIds:jsonb('workspace_ids').notNull(),attempts:integer('attempts').notNull().default(0),leaseUntil:timestamp('lease_until',{withTimezone:true}),failureCode:text('failure_code'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),completedAt:timestamp('completed_at',{withTimezone:true})
},t=>[index('account_deletion_work_idx').on(t.status,t.leaseUntil)]);
export const privacyCleanupTasks = pgTable('privacy_cleanup_tasks', {
 id:uuid('id').defaultRandom().primaryKey(),requestId:uuid('request_id').notNull().references(()=>accountDeletionRequests.id,{onDelete:'cascade'}),objectKey:text('object_key').notNull(),status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0)
},t=>[uniqueIndex('privacy_cleanup_request_object_unique').on(t.requestId,t.objectKey)]);
export const deletionTombstones = pgTable('deletion_tombstones', {
 subjectId:text('subject_id').primaryKey(),workspaceIds:jsonb('workspace_ids').notNull(),generation:integer('generation').notNull(),deletedAt:timestamp('deleted_at',{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull().default(sql`now()+interval '35 days'`)
});
export const backupRuns = pgTable('backup_runs', {
 id:uuid('id').primaryKey(),objectKey:text('object_key').notNull(),checksum:text('checksum').notNull(),keyId:text('key_id').notNull(),status:text('status').notNull(),byteCount:bigint('byte_count',{mode:'number'}).notNull(),durationMs:integer('duration_ms').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const backupRestoreChecks = pgTable('backup_restore_checks', {
 id:uuid('id').defaultRandom().primaryKey(),backupId:uuid('backup_id').notNull(),outcome:text('outcome').notNull(),durationMs:integer('duration_ms').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const userPreferences = pgTable('user_preferences', {
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),
 theme:text('theme',{enum:['light','dark','system']}).notNull().default('system'),
 locale:text('locale',{enum:['en','id']}).notNull().default('en'),
 customized:boolean('customized').notNull().default(false),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
});
export const onboardingState = pgTable('onboarding_state', {
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),
 usageType:text('usage_type',{enum:['personal','business','both']}),
 currency:varchar('currency',{length:3}).notNull().default('IDR'),
 language:text('language',{enum:['en','id']}).notNull().default('en'),
 currentStep:text('current_step').notNull().default('usage'),
 firstWorkspaceId:uuid('first_workspace_id'),
 completedAt:timestamp('completed_at',{withTimezone:true}),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
});


// Core tracking V2. Cross-row ledger and split invariants are enforced by migration 0027.
const captureIdentity = () => ({id:uuid('id').defaultRandom().primaryKey(),workspaceId:uuid('workspace_id').notNull().references(()=>workspaces.id)});
export const exchangeRates=pgTable('exchange_rates',{
 id:uuid('id').defaultRandom().primaryKey(),sourceCurrency:varchar('source_currency',{length:3}).notNull(),baseCurrency:varchar('base_currency',{length:3}).notNull(),
 rateDate:date('rate_date').notNull(),rate:numeric('rate',{precision:28,scale:12}).notNull(),provider:text('provider').notNull(),fetchedAt:timestamp('fetched_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('exchange_rates_observation_unique').on(t.sourceCurrency,t.baseCurrency,t.rateDate,t.provider,t.rate)]);
export const transactionFxSnapshots=pgTable('transaction_fx_snapshots',{
 ...captureIdentity(),transactionId:uuid('transaction_id').notNull(),revision:integer('revision').notNull(),sourceCurrency:varchar('source_currency',{length:3}).notNull(),baseCurrency:varchar('base_currency',{length:3}).notNull(),
 sourceAmount:numeric('source_amount',{precision:19,scale:4}).notNull(),baseAmount:numeric('base_amount',{precision:19,scale:4}).notNull(),rate:numeric('rate',{precision:28,scale:12}).notNull(),rateDate:date('rate_date').notNull(),provider:text('provider').notNull(),
 feeTransactionId:uuid('fee_transaction_id'),actualTransferRate:numeric('actual_transfer_rate',{precision:28,scale:12}),roundingAdjustment:numeric('rounding_adjustment',{precision:28,scale:12}),destinationCurrency:varchar('destination_currency',{length:3}),destinationAmount:numeric('destination_amount',{precision:19,scale:4}),destinationBaseAmount:numeric('destination_base_amount',{precision:19,scale:4}),destinationRate:numeric('destination_rate',{precision:28,scale:12}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('transaction_fx_revision_unique').on(t.workspaceId,t.transactionId,t.revision),foreignKey({columns:[t.workspaceId,t.transactionId],foreignColumns:[transactions.workspaceId,transactions.id]}),foreignKey({name:'transaction_fx_fee_fk',columns:[t.workspaceId,t.feeTransactionId],foreignColumns:[transactions.workspaceId,transactions.id]})]);
export const transactionSplits=pgTable('transaction_splits',{
 ...captureIdentity(),transactionId:uuid('transaction_id').notNull(),categoryId:uuid('category_id').notNull(),amount:numeric('amount',{precision:19,scale:4}).notNull(),baseAmount:numeric('base_amount',{precision:19,scale:4}).notNull(),notes:text('notes'),position:integer('position').notNull()
},t=>[uniqueIndex('transaction_split_position_unique').on(t.workspaceId,t.transactionId,t.position),foreignKey({columns:[t.workspaceId,t.transactionId],foreignColumns:[transactions.workspaceId,transactions.id]}),foreignKey({columns:[t.workspaceId,t.categoryId],foreignColumns:[categories.workspaceId,categories.id]})]);
export const bulkOperations=pgTable('bulk_operations',{
 ...captureIdentity(),actorUserId:text('actor_user_id').notNull().references(()=>user.id),action:text('action').notNull(),request:jsonb('request').notNull(),requestHash:text('request_hash').notNull(),status:text('status').notNull().default('preview'),result:jsonb('result'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),appliedAt:timestamp('applied_at',{withTimezone:true})
});
export const importJobs=pgTable('import_jobs',{
 ...captureIdentity(),actorUserId:text('actor_user_id').notNull().references(()=>user.id),accountId:uuid('account_id').notNull(),sourceKind:text('source_kind').notNull(),objectKey:text('object_key'),checksum:text('checksum'),fileName:text('file_name').notNull(),mapping:jsonb('mapping'),parserVersion:text('parser_version').notNull().default('tracking-v2-1'),status:text('status').notNull().default('uploaded'),error:text('error'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull().default(sql`now()+interval '7 days'`)
},t=>[uniqueIndex('import_jobs_workspace_id_unique').on(t.workspaceId,t.id),foreignKey({columns:[t.workspaceId,t.accountId],foreignColumns:[accounts.workspaceId,accounts.id]})]);
export const importRows=pgTable('import_rows',{
 ...captureIdentity(),jobId:uuid('job_id').notNull(),rowNumber:integer('row_number').notNull(),raw:jsonb('raw'),normalized:jsonb('normalized'),fingerprint:text('fingerprint'),status:text('status').notNull().default('review'),error:text('error'),transactionId:uuid('transaction_id')
},t=>[uniqueIndex('import_row_number_unique').on(t.workspaceId,t.jobId,t.rowNumber),index('import_review_idx').on(t.workspaceId,t.jobId,t.rowNumber),foreignKey({columns:[t.workspaceId,t.jobId],foreignColumns:[importJobs.workspaceId,importJobs.id]}),foreignKey({columns:[t.workspaceId,t.transactionId],foreignColumns:[transactions.workspaceId,transactions.id]})]);
export const ocrJobs=pgTable('ocr_jobs',{
 ...captureIdentity(),actorUserId:text('actor_user_id').notNull().references(()=>user.id),objectKey:text('object_key').notNull(),mimeType:text('mime_type').notNull(),fileName:text('file_name').notNull(),checksum:text('checksum').notNull(),sizeBytes:integer('size_bytes').notNull(),status:text('status').notNull().default('queued'),extracted:jsonb('extracted'),error:text('error'),transactionId:uuid('transaction_id'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull().default(sql`now()+interval '7 days'`)
},t=>[foreignKey({columns:[t.workspaceId,t.transactionId],foreignColumns:[transactions.workspaceId,transactions.id]})]);

// Personal-finance V2. Cross-workspace references and monetary/state constraints are enforced by 0029/0030.
const pfIdentity=()=>({id:uuid('id').defaultRandom().primaryKey(),workspaceId:uuid('workspace_id').notNull().references(()=>workspaces.id)});
const pfMoney=(name:string)=>numeric(name,{precision:19,scale:4});
export const budgetPlans=pgTable('budget_plans',{
 ...pfIdentity(),name:text('name').notNull(),method:text('method').notNull(),startsOn:date('starts_on').notNull(),endsOn:date('ends_on').notNull(),currency:varchar('currency',{length:3}).notNull(),fundingBasis:text('funding_basis').notNull(),plannedFunding:pfMoney('planned_funding').notNull(),status:text('status').notNull().default('draft'),revision:integer('revision').notNull().default(1),createdBy:text('created_by').notNull().references(()=>user.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('budget_plans_workspace_id_unique').on(t.workspaceId,t.id),index('budget_plans_workspace_period').on(t.workspaceId,t.startsOn)]);
export const budgetBuckets=pgTable('budget_buckets',{
 ...pfIdentity(),planId:uuid('plan_id').notNull(),name:text('name').notNull(),allocation:pfMoney('allocation').notNull(),targetPercent:integer('target_percent'),sortOrder:integer('sort_order').notNull()
},t=>[uniqueIndex('budget_buckets_workspace_id_unique').on(t.workspaceId,t.id),uniqueIndex('budget_buckets_plan_sort_unique').on(t.planId,t.sortOrder),foreignKey({columns:[t.workspaceId,t.planId],foreignColumns:[budgetPlans.workspaceId,budgetPlans.id]}).onDelete('cascade')]);
export const budgetBucketCategories=pgTable('budget_bucket_categories',{
 workspaceId:uuid('workspace_id').notNull(),planId:uuid('plan_id').notNull(),bucketId:uuid('bucket_id').notNull(),categoryId:uuid('category_id').notNull()
},t=>[primaryKey({columns:[t.planId,t.categoryId]}),foreignKey({columns:[t.workspaceId,t.planId],foreignColumns:[budgetPlans.workspaceId,budgetPlans.id]}).onDelete('cascade'),foreignKey({columns:[t.workspaceId,t.bucketId],foreignColumns:[budgetBuckets.workspaceId,budgetBuckets.id]}).onDelete('cascade'),foreignKey({columns:[t.workspaceId,t.categoryId],foreignColumns:[categories.workspaceId,categories.id]})]);
export const envelopeMovements=pgTable('envelope_movements',{
 ...pfIdentity(),planId:uuid('plan_id').notNull(),fromBucketId:uuid('from_bucket_id').notNull(),toBucketId:uuid('to_bucket_id').notNull(),amount:pfMoney('amount').notNull(),reason:text('reason').notNull(),idempotencyKey:text('idempotency_key').notNull(),createdBy:text('created_by').notNull().references(()=>user.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('envelope_movements_key').on(t.planId,t.idempotencyKey),foreignKey({columns:[t.workspaceId,t.planId],foreignColumns:[budgetPlans.workspaceId,budgetPlans.id]}).onDelete('cascade'),foreignKey({columns:[t.workspaceId,t.fromBucketId],foreignColumns:[budgetBuckets.workspaceId,budgetBuckets.id]}),foreignKey({columns:[t.workspaceId,t.toBucketId],foreignColumns:[budgetBuckets.workspaceId,budgetBuckets.id]})]);
export const debts=pgTable('debts',{
 ...pfIdentity(),name:text('name').notNull(),linkedAccountId:uuid('linked_account_id').notNull(),currency:varchar('currency',{length:3}).notNull(),apr:numeric('apr',{precision:9,scale:4}).notNull(),minimumPayment:pfMoney('minimum_payment').notNull(),dueDay:integer('due_day').notNull(),startsOn:date('starts_on').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),archivedAt:timestamp('archived_at',{withTimezone:true})
},t=>[uniqueIndex('debts_workspace_id_unique').on(t.workspaceId,t.id),uniqueIndex('debts_link_unique').on(t.workspaceId,t.linkedAccountId),foreignKey({columns:[t.workspaceId,t.linkedAccountId],foreignColumns:[accounts.workspaceId,accounts.id]})]);
export const debtPayments=pgTable('debt_payments',{
 ...pfIdentity(),debtId:uuid('debt_id').notNull(),principal:pfMoney('principal').notNull(),interest:pfMoney('interest').notNull(),fees:pfMoney('fees').notNull(),occurredOn:date('occurred_on').notNull(),principalTransactionId:uuid('principal_transaction_id').notNull(),expenseTransactionId:uuid('expense_transaction_id'),idempotencyKey:text('idempotency_key').notNull(),createdBy:text('created_by').notNull().references(()=>user.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('debt_payments_key').on(t.debtId,t.idempotencyKey),foreignKey({columns:[t.workspaceId,t.debtId],foreignColumns:[debts.workspaceId,debts.id]}),foreignKey({columns:[t.workspaceId,t.principalTransactionId],foreignColumns:[transactions.workspaceId,transactions.id]}),foreignKey({columns:[t.workspaceId,t.expenseTransactionId],foreignColumns:[transactions.workspaceId,transactions.id]})]);
export const debtPayoffPlans=pgTable('debt_payoff_plans',{
 ...pfIdentity(),strategy:text('strategy').notNull(),startsOn:date('starts_on').notNull(),extra:pfMoney('extra').notNull(),currency:varchar('currency',{length:3}).notNull(),assumptions:jsonb('assumptions').notNull(),result:jsonb('result').notNull(),calculationVersion:integer('calculation_version').notNull().default(1),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const subscriptions=pgTable('subscriptions',{
 ...pfIdentity(),name:text('name').notNull(),normalizedMerchant:text('normalized_merchant').notNull(),accountId:uuid('account_id').notNull(),currency:varchar('currency',{length:3}).notNull(),amount:pfMoney('amount').notNull(),cadence:text('cadence').notNull(),nextCharge:date('next_charge').notNull(),status:text('status').notNull().default('active'),billId:uuid('bill_id'),lastReviewedOn:date('last_reviewed_on').notNull(),cancelledOn:date('cancelled_on'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('subscriptions_workspace_id_unique').on(t.workspaceId,t.id),foreignKey({columns:[t.workspaceId,t.accountId],foreignColumns:[accounts.workspaceId,accounts.id]}),foreignKey({columns:[t.workspaceId,t.billId],foreignColumns:[bills.workspaceId,bills.id]})]);
export const subscriptionCandidates=pgTable('subscription_candidates',{
 ...pfIdentity(),normalizedMerchant:text('normalized_merchant').notNull(),accountId:uuid('account_id').notNull(),currency:varchar('currency',{length:3}).notNull(),cadence:text('cadence').notNull(),amount:pfMoney('amount').notNull(),evidence:jsonb('evidence').notNull(),confidence:text('confidence').notNull(),state:text('state').notNull().default('pending'),subscriptionId:uuid('subscription_id'),algorithmVersion:integer('algorithm_version').notNull().default(1),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('subscription_candidate_group').on(t.workspaceId,t.normalizedMerchant,t.accountId,t.currency,t.cadence),foreignKey({columns:[t.workspaceId,t.accountId],foreignColumns:[accounts.workspaceId,accounts.id]}),foreignKey({columns:[t.workspaceId,t.subscriptionId],foreignColumns:[subscriptions.workspaceId,subscriptions.id]})]);
export const subscriptionTransactionLinks=pgTable('subscription_transaction_links',{
 workspaceId:uuid('workspace_id').notNull(),subscriptionId:uuid('subscription_id').notNull(),transactionId:uuid('transaction_id').notNull()
},t=>[primaryKey({columns:[t.subscriptionId,t.transactionId]}),foreignKey({columns:[t.workspaceId,t.subscriptionId],foreignColumns:[subscriptions.workspaceId,subscriptions.id]}),foreignKey({columns:[t.workspaceId,t.transactionId],foreignColumns:[transactions.workspaceId,transactions.id]})]);
export const netWorthItems=pgTable('net_worth_items',{
 ...pfIdentity(),name:text('name').notNull(),kind:text('kind').notNull(),currency:varchar('currency',{length:3}).notNull(),ownershipPercent:numeric('ownership_percent',{precision:7,scale:4}).notNull().default('100'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),archivedAt:timestamp('archived_at',{withTimezone:true})
},t=>[uniqueIndex('net_worth_items_workspace_id_unique').on(t.workspaceId,t.id)]);
export const netWorthValuations=pgTable('net_worth_valuations',{
 ...pfIdentity(),itemId:uuid('item_id').notNull(),asOf:date('as_of').notNull(),amount:pfMoney('amount').notNull(),source:text('source').notNull(),recordedAt:timestamp('recorded_at',{withTimezone:true}).notNull().defaultNow()
},t=>[foreignKey({columns:[t.workspaceId,t.itemId],foreignColumns:[netWorthItems.workspaceId,netWorthItems.id]}),index('net_worth_valuation_latest').on(t.workspaceId,t.itemId,t.asOf,t.recordedAt)]);
export const netWorthSnapshots=pgTable('net_worth_snapshots',{
 ...pfIdentity(),asOf:date('as_of').notNull(),currency:varchar('currency',{length:3}).notNull(),assets:pfMoney('assets'),liabilities:pfMoney('liabilities'),netWorth:pfMoney('net_worth'),status:text('status').notNull(),revision:integer('revision').notNull(),calculationVersion:integer('calculation_version').notNull().default(1),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('net_worth_revision_unique').on(t.workspaceId,t.asOf,t.revision)]);
export const netWorthSnapshotLines=pgTable('net_worth_snapshot_lines',{
 ...pfIdentity(),snapshotId:uuid('snapshot_id').notNull().references(()=>netWorthSnapshots.id),sourceId:uuid('source_id').notNull(),sourceType:text('source_type').notNull(),name:text('name').notNull(),kind:text('kind').notNull(),currency:varchar('currency',{length:3}).notNull(),sourceAmount:pfMoney('source_amount'),sourceDate:date('source_date'),rate:numeric('rate',{precision:28,scale:12}),rateDate:date('rate_date'),baseAmount:pfMoney('base_amount'),status:text('status').notNull()
});
