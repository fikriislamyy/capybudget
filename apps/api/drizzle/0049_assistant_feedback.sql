CREATE TABLE assistant_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('finding','suggestion','summary')), source_id uuid NOT NULL,
 kind text NOT NULL, fingerprint text NOT NULL,
 vote text CHECK(vote IN ('helpful','not_helpful')), vote_at timestamptz, dismissed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
 UNIQUE(workspace_id,user_id,source_type,source_id,kind,fingerprint),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX assistant_feedback_owner_expiry_idx ON assistant_feedback(workspace_id,user_id,expires_at);
--> statement-breakpoint
ALTER TABLE assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_feedback_tenant ON assistant_feedback
 USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=assistant_feedback.workspace_id AND m.user_id=assistant_feedback.user_id))
 WITH CHECK(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=assistant_feedback.workspace_id AND m.user_id=assistant_feedback.user_id));
