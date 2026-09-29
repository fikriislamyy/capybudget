CREATE TABLE budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  cadence text NOT NULL CHECK (cadence IN ('weekly','monthly')),
  amount numeric(19,4) NOT NULL CHECK (amount >= 0),
  currency varchar(3) NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  archived boolean NOT NULL DEFAULT false,
  legacy_baseline boolean NOT NULL DEFAULT false,
  recorded_by text REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,budget_id,revision),
  FOREIGN KEY(workspace_id,budget_id) REFERENCES budgets(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE RESTRICT,
  CHECK(valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX budget_revisions_period_idx ON budget_revisions(workspace_id,budget_id,valid_from,valid_to);
--> statement-breakpoint
INSERT INTO budget_revisions(workspace_id,budget_id,revision,cadence,amount,currency,category_id,name,valid_from,archived,legacy_baseline,recorded_by)
SELECT b.workspace_id,b.id,1,b.cadence,b.amount,b.currency,b.category_id,b.name,b.starts_on,b.archived_at IS NOT NULL,true,b.created_by
FROM budgets b;
--> statement-breakpoint
CREATE TABLE cashflow_category_mappings (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  activity text NOT NULL CHECK(activity IN ('operating','investing','financing','unclassified')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,category_id),
  FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK(report_type IN ('analytics','cashflow','budget_actual')),
  preset text NOT NULL CHECK(preset IN ('this_week','last_week','this_month','last_month','year_to_date')),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_key text NOT NULL,
  report_version text NOT NULL DEFAULT 'reports-v1',
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_from date NOT NULL,
  period_to_exclusive date NOT NULL,
  timezone text NOT NULL,
  currency varchar(3) NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK(row_count BETWEEN 0 AND 50000),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,requested_by,request_key),
  CHECK(period_to_exclusive > period_from)
);
CREATE INDEX report_runs_owner_idx ON report_runs(workspace_id,requested_by,generated_at DESC);
CREATE INDEX report_runs_expiry_idx ON report_runs(expires_at);
--> statement-breakpoint
CREATE TABLE report_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  requested_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  section text NOT NULL CHECK(section IN ('summary','series','categories','cashflow','budget_actual','bills','goals','accounts','activity')),
  row_number integer NOT NULL CHECK(row_number>=0),
  row_data jsonb NOT NULL,
  UNIQUE(workspace_id,run_id,section,row_number),
  FOREIGN KEY(workspace_id,run_id) REFERENCES report_runs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX report_rows_page_idx ON report_rows(workspace_id,requested_by,run_id,section,row_number);
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['budget_revisions','cashflow_category_mappings','report_runs','report_rows'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    IF tab IN ('report_runs','report_rows') THEN
      EXECUTE format('CREATE POLICY report_tenant ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND requested_by=nullif(current_setting(''app.user_id'',true),'''') AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
    ELSE
      EXECUTE format('CREATE POLICY report_tenant ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
    END IF;
  END LOOP;
END $$;
