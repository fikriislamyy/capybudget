ALTER TABLE finance_notifications ADD COLUMN source_type text NOT NULL DEFAULT 'legacy';
ALTER TABLE finance_notifications ADD COLUMN source_revision text;
ALTER TABLE finance_notifications ADD COLUMN rule_version text;
ALTER TABLE finance_notifications ADD COLUMN message_key text NOT NULL DEFAULT 'legacy';
ALTER TABLE finance_notifications ADD COLUMN message_params jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_notifications ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_notifications ADD COLUMN severity text NOT NULL DEFAULT 'attention' CHECK(severity IN ('info','attention','urgent'));
ALTER TABLE finance_notifications ADD COLUMN action_type text;
ALTER TABLE finance_notifications ADD COLUMN dismissed_at timestamptz;
ALTER TABLE finance_notifications ADD COLUMN snoozed_until timestamptz;
ALTER TABLE finance_notifications ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days';
ALTER TABLE finance_notifications ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE finance_notifications ADD COLUMN resolution_reason text;
ALTER TABLE finance_notifications ADD CONSTRAINT finance_notifications_workspace_user_id_unique UNIQUE(workspace_id,user_id,id);
CREATE INDEX finance_notifications_cursor_idx ON finance_notifications(workspace_id,user_id,created_at DESC,id DESC);
CREATE INDEX finance_notifications_unread_active_idx ON finance_notifications(workspace_id,user_id,created_at DESC,id DESC) WHERE read_at IS NULL AND resolved_at IS NULL AND dismissed_at IS NULL;
--> statement-breakpoint
ALTER TABLE finance_notification_preferences ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE finance_notification_preferences DROP CONSTRAINT finance_notification_preferences_channel_check;
ALTER TABLE finance_notification_preferences ADD CONSTRAINT finance_notification_preferences_channel_check CHECK(channel IN ('email','push','in_app'));
--> statement-breakpoint
CREATE TABLE finance_notification_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 rule_type text NOT NULL CHECK(rule_type IN ('low_balance','unusual_spending')),
 scope_key text NOT NULL,
 account_id uuid,
 category_id uuid,
 currency varchar(3),
 enabled boolean NOT NULL DEFAULT false,
 parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,rule_type,scope_key),
 UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE CASCADE,
 CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 CHECK((rule_type='low_balance' AND account_id IS NOT NULL AND category_id IS NULL AND currency IS NULL) OR (rule_type='unusual_spending' AND account_id IS NULL AND currency IS NOT NULL))
);
CREATE INDEX finance_notification_rules_actor_idx ON finance_notification_rules(workspace_id,user_id,enabled,rule_type);
ALTER TABLE finance_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_notification_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_notification_rules_tenant ON finance_notification_rules USING (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_rules.workspace_id AND m.user_id=finance_notification_rules.user_id))
) WITH CHECK (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_rules.workspace_id AND m.user_id=finance_notification_rules.user_id))
);
--> statement-breakpoint
CREATE TABLE finance_notification_evaluation_state (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, rule_key text NOT NULL, scope_key text NOT NULL,
 period_key text NOT NULL, rule_version text NOT NULL DEFAULT '1', source_version text,
 dirty_version bigint NOT NULL DEFAULT 1, processed_version bigint NOT NULL DEFAULT 0,
 cursor jsonb, state jsonb NOT NULL DEFAULT '{}'::jsonb,
 next_evaluation_at timestamptz NOT NULL DEFAULT now(), lease_expires_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,rule_key,scope_key,period_key)
);
CREATE INDEX finance_notification_evaluation_due_idx ON finance_notification_evaluation_state(next_evaluation_at,lease_expires_at) WHERE dirty_version>processed_version;
ALTER TABLE finance_notification_evaluation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_notification_evaluation_state FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_notification_evaluation_state_tenant ON finance_notification_evaluation_state USING (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_evaluation_state.workspace_id AND m.user_id=finance_notification_evaluation_state.user_id))
) WITH CHECK (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_evaluation_state.workspace_id AND m.user_id=finance_notification_evaluation_state.user_id))
);
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_workspace_id_unique UNIQUE(workspace_id,id);
CREATE TABLE finance_notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, notification_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','push')), destination_key text NOT NULL,
 push_subscription_id uuid, generation integer NOT NULL DEFAULT 1 CHECK(generation>0), preference_version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','delivered','retryable','failed','cancelled','expired','unknown')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), available_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 lease_expires_at timestamptz, send_started_at timestamptz, provider_message_id text, last_error_code text,
 accepted_at timestamptz, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,notification_id,channel,destination_key,generation), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,user_id,notification_id) REFERENCES finance_notifications(workspace_id,user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,push_subscription_id) REFERENCES push_subscriptions(workspace_id,id) ON DELETE CASCADE,
 CHECK((channel='push' AND push_subscription_id IS NOT NULL) OR (channel='email' AND push_subscription_id IS NULL))
);
CREATE INDEX finance_notification_delivery_due_idx ON finance_notification_deliveries(status,available_at,created_at);
CREATE INDEX finance_notification_delivery_lease_idx ON finance_notification_deliveries(lease_expires_at) WHERE status='processing';
ALTER TABLE finance_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_notification_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_notification_deliveries_tenant ON finance_notification_deliveries USING (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_deliveries.workspace_id AND m.user_id=finance_notification_deliveries.user_id))
) WITH CHECK (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notification_deliveries.workspace_id AND m.user_id=finance_notification_deliveries.user_id))
);
--> statement-breakpoint
DROP POLICY finance_notifications_tenant ON finance_notifications;
CREATE POLICY finance_notifications_tenant ON finance_notifications USING (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notifications.workspace_id AND m.user_id=finance_notifications.user_id))
) WITH CHECK (
 current_setting('app.notification_worker',true)='true' OR (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=finance_notifications.workspace_id AND m.user_id=finance_notifications.user_id))
);
