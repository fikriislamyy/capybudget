-- UX MVP: user preferences (theme/locale) and onboarding progress.
-- User-scoped tables keyed by user_id; RLS binds rows to app.user_id.
CREATE TABLE user_preferences (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
  locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','id')),
  customized boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE onboarding_state (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  usage_type text CHECK(usage_type IN ('personal','business','both')),
  currency varchar(3) NOT NULL DEFAULT 'IDR' CHECK(currency ~ '^[A-Z]{3}$'),
  language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','id')),
  current_step text NOT NULL DEFAULT 'usage' CHECK(current_step IN ('usage','details','account','goal','done')),
  first_workspace_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_scope ON user_preferences USING (user_id=nullif(current_setting('app.user_id',true),'')) WITH CHECK (user_id=nullif(current_setting('app.user_id',true),''));
--> statement-breakpoint
CREATE POLICY user_scope ON onboarding_state USING (user_id=nullif(current_setting('app.user_id',true),'')) WITH CHECK (user_id=nullif(current_setting('app.user_id',true),''));
--> statement-breakpoint
-- Onboarding may set the currency of a fresh owner workspace; no app code updated
-- workspaces before, so this is the first (owner-only) UPDATE policy on the table.
CREATE POLICY workspace_owner_update ON workspaces FOR UPDATE USING(owner_user_id=nullif(current_setting('app.user_id',true),'')) WITH CHECK(owner_user_id=nullif(current_setting('app.user_id',true),''));
--> statement-breakpoint
-- Existing users already use the app: mark onboarding done so only new users see the wizard.
INSERT INTO onboarding_state(user_id,usage_type,current_step,completed_at)
SELECT u.id, CASE WHEN EXISTS(SELECT 1 FROM workspaces w WHERE w.owner_user_id=u.id AND w.kind='business' AND w.archived_at IS NULL) THEN 'both' ELSE 'personal' END, 'done', now()
FROM "user" u ON CONFLICT(user_id) DO NOTHING;
