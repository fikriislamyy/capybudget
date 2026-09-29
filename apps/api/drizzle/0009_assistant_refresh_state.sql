CREATE TABLE assistant_refresh_state (
 workspace_id uuid NOT NULL,
 user_id text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 last_input_hash text,
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE assistant_refresh_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_refresh_state FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_refresh_state_tenant ON assistant_refresh_state
 USING (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=assistant_refresh_state.workspace_id AND m.user_id=nullif(current_setting('app.user_id',true),'')))
 WITH CHECK (workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=assistant_refresh_state.workspace_id AND m.user_id=nullif(current_setting('app.user_id',true),'')));
--> statement-breakpoint
CREATE INDEX assistant_refresh_due_idx ON assistant_refresh_state(checked_at);
