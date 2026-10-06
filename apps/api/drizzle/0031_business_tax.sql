CREATE TABLE business_tax_settings (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
 jurisdiction text NOT NULL DEFAULT 'ID' CHECK(jurisdiction='ID'),
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 updated_by text REFERENCES "user"(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE business_tax_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 statutory_rate numeric(7,4) NOT NULL CHECK(statutory_rate BETWEEN 0 AND 100),
 base_numerator integer NOT NULL DEFAULT 1 CHECK(base_numerator>0),
 base_denominator integer NOT NULL DEFAULT 1 CHECK(base_denominator BETWEEN 1 AND 1000000 AND base_numerator<=base_denominator),
 inclusive boolean NOT NULL DEFAULT false,
 effective_from date NOT NULL,effective_to date CHECK(effective_to IS NULL OR effective_to>=effective_from),
 applicability text NOT NULL CHECK(length(applicability) BETWEEN 1 AND 1000),
 created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 UNIQUE(workspace_id,id)
);
CREATE INDEX business_tax_rates_effective ON business_tax_rates(workspace_id,effective_from,effective_to) WHERE archived_at IS NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['business_tax_settings','business_tax_rates'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY workspace_read ON %I FOR SELECT USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''') AND m.role IN (''owner'',''accountant'',''viewer'')))',t,t);
 EXECUTE format('CREATE POLICY workspace_write ON %I FOR ALL USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''') AND m.role=''owner'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''') AND m.role=''owner''))',t,t,t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
 END LOOP;
END $$;

ALTER TABLE invoice_lines ADD COLUMN tax_rate_id uuid, ADD COLUMN tax_snapshot jsonb;
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_tax_rate_workspace_fk FOREIGN KEY(workspace_id,tax_rate_id) REFERENCES business_tax_rates(workspace_id,id);
