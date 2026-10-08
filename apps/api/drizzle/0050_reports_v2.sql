ALTER TABLE report_runs DROP CONSTRAINT report_runs_report_type_check;
ALTER TABLE report_runs ADD CHECK(report_type IN ('analytics','cashflow','budget_actual','profit_loss','balance_sheet','tax'));
ALTER TABLE report_runs DROP CONSTRAINT report_runs_preset_check;
ALTER TABLE report_runs ADD CHECK(preset IN ('custom','this_week','last_week','this_month','last_month','year_to_date'));
ALTER TABLE report_rows DROP CONSTRAINT report_rows_section_check;
ALTER TABLE report_rows ADD CHECK(section IN ('summary','series','categories','cashflow','budget_actual','bills','goals','accounts','activity','ledger','tax_sales','tax_purchases','comparison','grouped'));
--> statement-breakpoint
CREATE TABLE saved_report_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 definition jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id)
);
CREATE INDEX saved_reports_owner ON saved_report_definitions(workspace_id,requested_by,updated_at);
--> statement-breakpoint
CREATE TABLE report_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, definition_id uuid NOT NULL,
 cadence text NOT NULL CHECK(cadence IN ('weekly','monthly')), local_time text NOT NULL CHECK(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 timezone text NOT NULL, locale text NOT NULL CHECK(locale IN ('en','id')), format text NOT NULL CHECK(format IN ('csv','xlsx','pdf')),
 enabled boolean NOT NULL DEFAULT true, consent_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 next_run_at timestamptz NOT NULL, last_state text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,definition_id) REFERENCES saved_report_definitions(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX report_schedules_due ON report_schedules(next_run_at) WHERE enabled;
--> statement-breakpoint
CREATE TABLE report_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, schedule_id uuid NOT NULL, schedule_version integer NOT NULL,
 definition_version integer NOT NULL, occurrence text NOT NULL, run_id uuid, export_id uuid,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','queued','sending','accepted','unknown','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), available_at timestamptz NOT NULL DEFAULT now(),
 lease_expires_at timestamptz, send_started_at timestamptz, accepted_at timestamptz, failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(schedule_id,occurrence),
 FOREIGN KEY(workspace_id,schedule_id) REFERENCES report_schedules(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,run_id) REFERENCES report_runs(workspace_id,id) ON DELETE SET NULL (run_id),
 FOREIGN KEY(workspace_id,export_id) REFERENCES report_exports(workspace_id,id) ON DELETE SET NULL (export_id)
);
CREATE INDEX report_deliveries_pending ON report_deliveries(state,available_at);
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['saved_report_definitions','report_schedules','report_deliveries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY report_tenant ON %I USING (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=current_setting(''app.user_id'',true) AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''app.user_id'',true)))) WITH CHECK (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=current_setting(''app.user_id'',true) AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''app.user_id'',true))))',tab,tab,tab);
 END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE saved_report_definitions ADD UNIQUE(workspace_id,id,requested_by);
ALTER TABLE report_schedules ADD UNIQUE(workspace_id,id,requested_by);
ALTER TABLE report_runs ADD UNIQUE(workspace_id,id,requested_by);
ALTER TABLE report_exports ADD UNIQUE(workspace_id,id,requested_by);
ALTER TABLE report_schedules ADD FOREIGN KEY(workspace_id,definition_id,requested_by) REFERENCES saved_report_definitions(workspace_id,id,requested_by) ON DELETE CASCADE;
ALTER TABLE report_deliveries ADD FOREIGN KEY(workspace_id,schedule_id,requested_by) REFERENCES report_schedules(workspace_id,id,requested_by) ON DELETE CASCADE;
ALTER TABLE report_deliveries ADD FOREIGN KEY(workspace_id,run_id,requested_by) REFERENCES report_runs(workspace_id,id,requested_by) ON DELETE SET NULL (run_id);
ALTER TABLE report_deliveries ADD FOREIGN KEY(workspace_id,export_id,requested_by) REFERENCES report_exports(workspace_id,id,requested_by) ON DELETE SET NULL (export_id);
