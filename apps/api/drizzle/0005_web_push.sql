ALTER TABLE finance_notification_preferences DROP CONSTRAINT finance_notification_preferences_channel_check;
ALTER TABLE finance_notification_preferences ADD CONSTRAINT finance_notification_preferences_channel_check CHECK(channel IN ('email','push'));
ALTER TABLE finance_notifications ADD COLUMN push_sent_at timestamptz;
--> statement-breakpoint
CREATE TABLE push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 endpoint text NOT NULL CHECK(length(endpoint)<=2048), p256dh text NOT NULL CHECK(length(p256dh)<=256), auth text NOT NULL CHECK(length(auth)<=256),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,user_id,endpoint)
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(workspace_id,user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_tenant ON push_subscriptions USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')) WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),''));
