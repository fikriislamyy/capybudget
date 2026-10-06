CREATE TABLE recurring_invoice_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 anchor_date date NOT NULL,frequency text NOT NULL CHECK(frequency IN ('day','week','month','year')),interval integer NOT NULL CHECK(interval BETWEEN 1 AND 120),
 due_days integer NOT NULL CHECK(due_days BETWEEN 0 AND 365),end_date date,active boolean NOT NULL DEFAULT true,auto_issue boolean NOT NULL DEFAULT false,auto_send boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,payload jsonb NOT NULL,next_index integer NOT NULL DEFAULT 0,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),CHECK(end_date IS NULL OR end_date>=anchor_date),CHECK(NOT auto_send OR auto_issue)
);
CREATE TABLE recurring_invoice_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,template_id uuid NOT NULL,scheduled_on date NOT NULL,template_version integer NOT NULL,payload jsonb NOT NULL,
 invoice_id uuid,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','draft','issued','sent','failed')),auto_issue boolean NOT NULL,auto_send boolean NOT NULL,
 requested_by text NOT NULL REFERENCES "user"(id),due_days integer NOT NULL,attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),failure_code text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(template_id,scheduled_on),FOREIGN KEY(workspace_id,template_id) REFERENCES recurring_invoice_templates(workspace_id,id),FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id)
);
CREATE INDEX recurring_invoice_retry ON recurring_invoice_occurrences(state,next_attempt_at);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['recurring_invoice_templates','recurring_invoice_occurrences'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY recurring_invoice_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
END LOOP;END $$;
