CREATE TABLE business_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('customer','vendor','both')),details jsonb NOT NULL,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,UNIQUE(workspace_id,id)
);
CREATE INDEX business_contacts_search ON business_contacts(workspace_id,lower(name));
CREATE TABLE catalog_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),sku text NOT NULL CHECK(length(btrim(sku)) BETWEEN 1 AND 80),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),kind text NOT NULL CHECK(kind IN ('product','service')),unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 80),
 description text NOT NULL CHECK(length(description)<=500),unit_price numeric(19,4) NOT NULL CHECK(unit_price>=0),currency varchar(3) NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 tax_rate_id uuid,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,tax_rate_id) REFERENCES business_tax_rates(workspace_id,id)
);
CREATE UNIQUE INDEX catalog_items_sku ON catalog_items(workspace_id,lower(sku));
ALTER TABLE invoices ADD COLUMN contact_id uuid;
ALTER TABLE invoices ADD FOREIGN KEY(workspace_id,contact_id) REFERENCES business_contacts(workspace_id,id);
ALTER TABLE invoice_lines ADD COLUMN catalog_item_id uuid;
ALTER TABLE invoice_lines ADD COLUMN catalog_snapshot jsonb;
ALTER TABLE invoice_lines ADD FOREIGN KEY(workspace_id,catalog_item_id) REFERENCES catalog_items(workspace_id,id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['business_contacts','catalog_items'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY business_directory_read ON %I FOR SELECT USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''staff'',''viewer''))',t);
 EXECUTE format('CREATE POLICY business_directory_write ON %I FOR ALL USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
END LOOP;END $$;
CREATE POLICY business_tax_staff_read ON business_tax_settings FOR SELECT USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id)='staff');
CREATE POLICY business_rate_staff_read ON business_tax_rates FOR SELECT USING(workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND capybudget_workspace_role(workspace_id)='staff');
