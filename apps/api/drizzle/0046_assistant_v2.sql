ALTER TABLE assistant_settings ADD COLUMN voice_ai_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE forecast_scenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 base_run_id uuid NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), base_input_hash text NOT NULL, overrides jsonb NOT NULL, result jsonb NOT NULL, version integer NOT NULL DEFAULT 1, FOREIGN KEY(workspace_id,base_run_id) REFERENCES forecast_runs(workspace_id,id) ON DELETE CASCADE,
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX forecast_scenarios_owner_expiry_idx ON forecast_scenarios(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE insight_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 kind text NOT NULL, fingerprint text NOT NULL, detector_version text NOT NULL, evidence jsonb NOT NULL, facts jsonb NOT NULL, state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','legitimate','dismissed','obsolete')), reviewed_at timestamptz, UNIQUE(workspace_id,user_id,fingerprint),
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX insight_findings_owner_expiry_idx ON insight_findings(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE customer_payment_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 customer_id uuid NOT NULL, as_of_date date NOT NULL, metrics jsonb NOT NULL, algorithm_version text NOT NULL, UNIQUE(workspace_id,user_id,customer_id), FOREIGN KEY(workspace_id,customer_id) REFERENCES business_contacts(workspace_id,id) ON DELETE CASCADE,
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX customer_payment_metrics_owner_expiry_idx ON customer_payment_metrics(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE ai_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 title text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX ai_conversations_owner_expiry_idx ON ai_conversations(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE ai_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 conversation_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL, citations jsonb NOT NULL DEFAULT '[]', request_key text NOT NULL, UNIQUE(workspace_id,user_id,conversation_id,request_key,role), FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES ai_conversations(workspace_id,user_id,id) ON DELETE CASCADE,
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX ai_messages_owner_expiry_idx ON ai_messages(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE ai_tool_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 conversation_id uuid NOT NULL, tool_name text NOT NULL CHECK(tool_name IN ('spending','receivables','forecast','bills','goals')), arguments jsonb NOT NULL, evidence jsonb NOT NULL, invocation_id uuid, FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES ai_conversations(workspace_id,user_id,id) ON DELETE CASCADE,
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX ai_tool_calls_owner_expiry_idx ON ai_tool_calls(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE transaction_entry_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 origin text NOT NULL CHECK(origin IN ('text','voice')), original_text text NOT NULL, fields jsonb NOT NULL, unresolved_fields jsonb NOT NULL, version integer NOT NULL DEFAULT 1, state text NOT NULL DEFAULT 'review' CHECK(state IN ('review','confirmed','cancelled')), resulting_transaction_id uuid, request_key text NOT NULL, UNIQUE(workspace_id,user_id,request_key), FOREIGN KEY(workspace_id,resulting_transaction_id) REFERENCES transactions(workspace_id,id),
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX transaction_entry_drafts_owner_expiry_idx ON transaction_entry_drafts(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE assistant_summary_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 cadence text NOT NULL DEFAULT 'weekly' CHECK(cadence IN ('weekly','monthly')), timezone text NOT NULL, local_send_time time NOT NULL DEFAULT '09:00', quiet_start time NOT NULL DEFAULT '21:00', quiet_end time NOT NULL DEFAULT '08:00', channels jsonb NOT NULL DEFAULT '["in_app"]', nudge_frequency text NOT NULL DEFAULT 'off' CHECK(nudge_frequency IN ('off','daily','weekly')), enabled boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, UNIQUE(workspace_id,user_id),
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX assistant_summary_schedules_owner_expiry_idx ON assistant_summary_schedules(workspace_id,user_id,expires_at);
--> statement-breakpoint
CREATE TABLE assistant_summaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 period_start date NOT NULL, period_end date NOT NULL, kind text NOT NULL CHECK(kind IN ('weekly','monthly','nudge')), metrics jsonb NOT NULL, state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','delivered','suppressed')), schedule_version integer NOT NULL, UNIQUE(workspace_id,user_id,kind,period_start,period_end,schedule_version),
 UNIQUE(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX assistant_summaries_owner_expiry_idx ON assistant_summaries(workspace_id,user_id,expires_at);
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN FOREACH tab IN ARRAY ARRAY['forecast_scenarios','insight_findings','customer_payment_metrics','ai_conversations','ai_messages','ai_tool_calls','transaction_entry_drafts','assistant_summary_schedules','assistant_summaries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab); EXECUTE format('CREATE POLICY assistant_v2_tenant ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND user_id=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND user_id=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
END LOOP; END $$;
