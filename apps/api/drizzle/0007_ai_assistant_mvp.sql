CREATE TABLE assistant_settings (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 local_forecast_enabled boolean NOT NULL DEFAULT true,
 suggestions_enabled boolean NOT NULL DEFAULT true,
 categorization_enabled boolean NOT NULL DEFAULT true,
 external_ai_enabled boolean NOT NULL DEFAULT false,
 source_permissions jsonb NOT NULL DEFAULT '{"history":true,"recurring":true,"bills":true,"invoices":true,"budgets":true,"goals":true,"merchant":false,"notes":false}'::jsonb,
 tone text NOT NULL DEFAULT 'balanced' CHECK(tone IN ('playful','balanced','professional')),
 locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','id')),
 default_horizon_days smallint NOT NULL DEFAULT 30 CHECK(default_horizon_days IN (30,60,90)),
 safety_buffer numeric(19,4) NOT NULL DEFAULT 0 CHECK(safety_buffer>=0),
 consent_version integer NOT NULL DEFAULT 1 CHECK(consent_version>0),
 consented_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_memberships(workspace_id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE assistant_account_settings (
 workspace_id uuid NOT NULL, user_id text NOT NULL, account_id uuid NOT NULL,
 include_in_forecast boolean NOT NULL DEFAULT true, allow_external_ai boolean NOT NULL DEFAULT false,
 low_balance_threshold numeric(19,4) NOT NULL DEFAULT 0 CHECK(low_balance_threshold>=0),
 protected_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK(protected_amount>=0), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,account_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE forecast_transaction_overrides (
 workspace_id uuid NOT NULL, user_id text NOT NULL, transaction_id uuid NOT NULL,
 exclude_from_baseline boolean NOT NULL DEFAULT false, reason text CHECK(reason IS NULL OR length(reason)<=300), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,transaction_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE forecast_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 as_of_date date NOT NULL, snapshot_at timestamptz NOT NULL DEFAULT now(), horizon_days smallint NOT NULL CHECK(horizon_days IN (30,60,90)),
 currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), engine_version text NOT NULL,
 consent_version integer NOT NULL, scope_hash text NOT NULL, input_hash text NOT NULL,
 input_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('queued','running','ready','failed','superseded')),
 quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb, summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, expires_at timestamptz NOT NULL,
 lease_until timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), error_code text,
 UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX forecast_runs_latest_idx ON forecast_runs(workspace_id,user_id,as_of_date,horizon_days,requested_at DESC);
CREATE INDEX forecast_runs_queue_idx ON forecast_runs(status,lease_until,requested_at) WHERE status IN ('queued','running');
--> statement-breakpoint
CREATE TABLE forecast_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL, run_id uuid NOT NULL,
 account_id uuid, event_key text NOT NULL, event_date date NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('transaction','bill','recurring','invoice','estimate','transfer')),
 source_id uuid, source_version integer, amount numeric(19,4) NOT NULL, currency varchar(3) NOT NULL,
 certainty text NOT NULL CHECK(certainty IN ('actual','scheduled','expected','estimated')),
 scenario_inclusion text NOT NULL DEFAULT 'both' CHECK(scenario_inclusion IN ('both','base_only')),
 description text NOT NULL CHECK(length(description)<=300), evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(workspace_id,run_id,event_key),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,run_id) REFERENCES forecast_runs(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX forecast_events_date_idx ON forecast_events(workspace_id,user_id,run_id,event_date);
--> statement-breakpoint
CREATE TABLE forecast_daily_balances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL, run_id uuid NOT NULL,
 scope_key text NOT NULL, account_id uuid, date date NOT NULL, scenario text NOT NULL CHECK(scenario IN ('base','conservative')),
 opening_balance numeric(19,4) NOT NULL, inflows numeric(19,4) NOT NULL, outflows numeric(19,4) NOT NULL,
 closing_balance numeric(19,4) NOT NULL, minimum_balance numeric(19,4) NOT NULL,
 protected_amount numeric(19,4) NOT NULL CHECK(protected_amount>=0), headroom numeric(19,4) NOT NULL,
 UNIQUE(workspace_id,run_id,scope_key,date,scenario),
 CHECK((scope_key='workspace' AND account_id IS NULL) OR (scope_key='account:'||account_id::text AND account_id IS NOT NULL)),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,run_id) REFERENCES forecast_runs(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX forecast_daily_balance_lookup_idx ON forecast_daily_balances(workspace_id,user_id,run_id,scope_key,date);
--> statement-breakpoint
CREATE TABLE assistant_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL, run_id uuid,
 kind text NOT NULL CHECK(kind IN ('shortfall','low_balance','invoice_followup','savings','categorization')),
 fingerprint text NOT NULL, template_key text NOT NULL, facts jsonb NOT NULL DEFAULT '{}'::jsonb,
 reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, wording text,
 priority smallint NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','reviewing','completed','dismissed','snoozed','obsolete')),
 snoozed_until timestamptz, expires_at timestamptz NOT NULL, helpfulness text CHECK(helpfulness IN ('helpful','not_helpful')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,fingerprint), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,run_id) REFERENCES forecast_runs(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX assistant_suggestions_state_idx ON assistant_suggestions(workspace_id,user_id,state,priority DESC,created_at DESC);
--> statement-breakpoint
CREATE TABLE assistant_action_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL, suggestion_id uuid,
 action_type text NOT NULL CHECK(action_type IN ('review_payment_date','send_invoice_reminder','contribute_to_goal','record_transfer')),
 payload jsonb NOT NULL, source_versions jsonb NOT NULL DEFAULT '{}'::jsonb, payload_hash text NOT NULL,
 consent_version integer NOT NULL, state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','confirmed','completed','failed','expired')),
 expires_at timestamptz NOT NULL, confirmed_at timestamptz, completed_at timestamptz, result_type text, result_id uuid,
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,idempotency_key),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,suggestion_id) REFERENCES assistant_suggestions(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE category_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 transaction_type text NOT NULL CHECK(transaction_type IN ('income','expense')),
 matcher_type text NOT NULL CHECK(matcher_type IN ('merchant_exact','merchant_contains')),
 normalized_match text NOT NULL CHECK(length(normalized_match) BETWEEN 1 AND 200), category_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN ('explicit','learned')), support_count integer NOT NULL DEFAULT 0,
 accepted_count integer NOT NULL DEFAULT 0, rejected_count integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,transaction_type,matcher_type,normalized_match),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX category_rules_lookup_idx ON category_rules(workspace_id,user_id,transaction_type,enabled);
--> statement-breakpoint
CREATE TABLE category_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 transaction_id uuid NOT NULL, transaction_version integer NOT NULL, previous_category_id uuid, chosen_category_id uuid,
 normalized_merchant text NOT NULL DEFAULT '', prediction_source text NOT NULL CHECK(prediction_source IN ('explicit_rule','learned_rule','keyword_rule','manual','provider','none')),
 rule_id uuid, invocation_id uuid, decision text NOT NULL CHECK(decision IN ('accepted','corrected','rejected')),
 consent_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,transaction_id,transaction_version),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,previous_category_id) REFERENCES categories(workspace_id,id),
 FOREIGN KEY(workspace_id,chosen_category_id) REFERENCES categories(workspace_id,id)
);
--> statement-breakpoint
CREATE TABLE ai_invocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id text NOT NULL,
 feature text NOT NULL, provider text NOT NULL, model text, prompt_version text NOT NULL,
 consent_version integer NOT NULL, scope_hash text NOT NULL, input_hash text NOT NULL, request_key text NOT NULL,
 status text NOT NULL CHECK(status IN ('reserved','succeeded','failed','cancelled')),
 reserved_units integer NOT NULL DEFAULT 0, input_tokens integer, output_tokens integer, latency_ms integer,
 error_code text, validated_result jsonb, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,user_id,request_key),
 FOREIGN KEY(workspace_id,user_id) REFERENCES assistant_settings(workspace_id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['assistant_settings','assistant_account_settings','forecast_transaction_overrides','forecast_runs','forecast_events','forecast_daily_balances','assistant_suggestions','assistant_action_proposals','category_rules','category_feedback','ai_invocations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY assistant_tenant ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND user_id=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND user_id=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
 END LOOP;
END $$;

--> statement-breakpoint
ALTER TABLE bills ADD COLUMN payment_account_id uuid;
ALTER TABLE bills ADD COLUMN recurring_rule_id uuid;
ALTER TABLE bills ADD CONSTRAINT bills_payment_account_fk FOREIGN KEY(workspace_id,payment_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX recurring_rules_workspace_id_unique ON recurring_rules(workspace_id,id);
--> statement-breakpoint
ALTER TABLE bills ADD CONSTRAINT bills_recurring_rule_fk FOREIGN KEY(workspace_id,recurring_rule_id) REFERENCES recurring_rules(workspace_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX bills_recurring_rule_unique ON bills(workspace_id,recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE bill_occurrences ADD COLUMN transaction_id uuid;
ALTER TABLE bill_occurrences ADD COLUMN payment_account_id uuid;
ALTER TABLE bill_occurrences ADD COLUMN expected_payment_on date;
ALTER TABLE bill_occurrences ADD COLUMN deferrable_until date;
ALTER TABLE bill_occurrences ADD CONSTRAINT bill_occurrences_transaction_fk FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE bill_occurrences ADD CONSTRAINT bill_occurrences_payment_account_fk FOREIGN KEY(workspace_id,payment_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE bill_occurrences ADD CONSTRAINT bill_occurrences_deferral_check CHECK(deferrable_until IS NULL OR deferrable_until>=due_on);
CREATE UNIQUE INDEX bill_occurrences_transaction_unique ON bill_occurrences(workspace_id,transaction_id) WHERE transaction_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE invoices ADD COLUMN expected_payment_on date;
ALTER TABLE invoices ADD COLUMN expected_account_id uuid;
ALTER TABLE invoices ADD CONSTRAINT invoices_expected_account_fk FOREIGN KEY(workspace_id,expected_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT;
