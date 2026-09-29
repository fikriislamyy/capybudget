ALTER TABLE report_runs ADD COLUMN status text NOT NULL DEFAULT 'ready' CHECK(status IN ('queued','running','ready','failed'));
ALTER TABLE report_runs ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10);
ALTER TABLE report_runs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE report_runs ADD COLUMN failure_code text;
CREATE INDEX report_runs_recovery_idx ON report_runs(status,lease_expires_at,generated_at);
--> statement-breakpoint
CREATE TABLE report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  format text NOT NULL CHECK(format IN ('csv','xlsx','pdf')),
  request_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','ready','failed','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  lease_expires_at timestamptz,
  object_key text,
  checksum text,
  byte_count bigint CHECK(byte_count IS NULL OR byte_count>=0),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,requested_by,run_id,request_key),
  FOREIGN KEY(workspace_id,run_id) REFERENCES report_runs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX report_exports_recovery_idx ON report_exports(status,lease_expires_at,created_at);
CREATE INDEX report_exports_owner_idx ON report_exports(workspace_id,requested_by,created_at DESC);
--> statement-breakpoint
CREATE TABLE report_export_cleanup (
  object_key text PRIMARY KEY,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE FUNCTION enqueue_report_export_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.object_key IS NOT NULL THEN
    INSERT INTO report_export_cleanup(object_key) VALUES(OLD.object_key) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER report_export_cleanup_trigger AFTER DELETE ON report_exports FOR EACH ROW EXECUTE FUNCTION enqueue_report_export_cleanup();
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['report_runs','report_rows','report_exports'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('DROP POLICY IF EXISTS report_tenant ON %I',tab);
    IF tab='report_runs' THEN
      EXECUTE format('CREATE POLICY report_tenant ON %I USING (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))) WITH CHECK (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))))',tab,tab,tab);
    ELSIF tab='report_rows' THEN
      EXECUTE format('CREATE POLICY report_tenant ON %I USING (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))) WITH CHECK (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))))',tab,tab,tab);
    ELSE
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
      EXECUTE format('CREATE POLICY report_tenant ON %I USING (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))) WITH CHECK (current_setting(''app.report_worker'',true)=''true'' OR (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))))',tab,tab,tab);
    END IF;
  END LOOP;
END $$;
