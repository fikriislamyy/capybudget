CREATE TABLE budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 category_id uuid NOT NULL, name text NOT NULL, cadence text NOT NULL CHECK(cadence IN ('weekly','monthly')),
 amount numeric(19,4) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 starts_on date NOT NULL, alert_thresholds jsonb NOT NULL DEFAULT '[80,100]'::jsonb CHECK(jsonb_typeof(alert_thresholds)='array'),
 created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX budgets_workspace_idx ON budgets(workspace_id,archived_at);
CREATE UNIQUE INDEX budgets_active_category_cadence_unique ON budgets(workspace_id,category_id,cadence) WHERE archived_at IS NULL;
--> statement-breakpoint
CREATE TABLE savings_goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), name text NOT NULL,
 target_amount numeric(19,4) NOT NULL CHECK(target_amount>0), currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 target_date date, linked_account_id uuid, created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,linked_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX savings_goals_workspace_idx ON savings_goals(workspace_id,archived_at);
--> statement-breakpoint
CREATE TABLE goal_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), goal_id uuid NOT NULL,
 direction text NOT NULL CHECK(direction IN ('add','withdraw')), amount numeric(19,4) NOT NULL CHECK(amount>0), occurred_on date NOT NULL,
 note text, created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,goal_id) REFERENCES savings_goals(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX goal_contributions_goal_idx ON goal_contributions(workspace_id,goal_id,occurred_on);
--> statement-breakpoint
CREATE TABLE bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), name text NOT NULL,
 amount numeric(19,4) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), category_id uuid,
 frequency text NOT NULL CHECK(frequency IN ('once','week','month','year')), interval integer NOT NULL DEFAULT 1 CHECK(interval BETWEEN 1 AND 365),
 anchor_date date NOT NULL, next_due_date date NOT NULL, end_date date, reminder_days integer[] NOT NULL DEFAULT ARRAY[3,0],
 enabled boolean NOT NULL DEFAULT true, created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT,
 CHECK(end_date IS NULL OR end_date>=anchor_date), CHECK(cardinality(reminder_days)<=8 AND 0<=ALL(reminder_days) AND 0<=ANY(reminder_days))
);
CREATE INDEX bills_due_idx ON bills(workspace_id,enabled,next_due_date);
--> statement-breakpoint
CREATE TABLE bill_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), bill_id uuid NOT NULL,
 due_on date NOT NULL, name text NOT NULL, amount numeric(19,4) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL,
 status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','skipped')), paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,bill_id,due_on),
 FOREIGN KEY(workspace_id,bill_id) REFERENCES bills(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX bill_occurrence_upcoming_idx ON bill_occurrences(workspace_id,due_on,status);
--> statement-breakpoint
CREATE TABLE finance_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, kind text NOT NULL, source_id uuid NOT NULL,
 dedupe_key text NOT NULL, title text NOT NULL, message text NOT NULL, read_at timestamptz, email_sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,user_id,dedupe_key)
);
CREATE INDEX finance_notifications_user_idx ON finance_notifications(user_id,read_at,created_at DESC);
--> statement-breakpoint
CREATE TABLE finance_notification_preferences (
 workspace_id uuid NOT NULL REFERENCES workspaces(id), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 event_type text NOT NULL, channel text NOT NULL CHECK(channel='email'), enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,user_id,event_type,channel)
);
ALTER TABLE finance_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_notification_preferences_tenant ON finance_notification_preferences USING (workspace_id=current_setting('app.workspace_id',true)::uuid AND user_id=current_setting('app.user_id',true)) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid AND user_id=current_setting('app.user_id',true));
--> statement-breakpoint
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY budgets_tenant ON budgets USING (workspace_id=current_setting('app.workspace_id',true)::uuid) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY savings_goals_tenant ON savings_goals USING (workspace_id=current_setting('app.workspace_id',true)::uuid) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions FORCE ROW LEVEL SECURITY;
CREATE POLICY goal_contributions_tenant ON goal_contributions USING (workspace_id=current_setting('app.workspace_id',true)::uuid) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE ROW LEVEL SECURITY;
CREATE POLICY bills_tenant ON bills USING (workspace_id=current_setting('app.workspace_id',true)::uuid) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
ALTER TABLE bill_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_occurrences FORCE ROW LEVEL SECURITY;
CREATE POLICY bill_occurrences_tenant ON bill_occurrences USING (workspace_id=current_setting('app.workspace_id',true)::uuid) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
ALTER TABLE finance_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_notifications_tenant ON finance_notifications USING (workspace_id=current_setting('app.workspace_id',true)::uuid AND user_id=current_setting('app.user_id',true)) WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid AND user_id=current_setting('app.user_id',true));
