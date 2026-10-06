ALTER TABLE recurring_invoice_templates ADD COLUMN next_scan_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE recurring_invoice_occurrences DROP CONSTRAINT recurring_invoice_occurrences_state_check;
ALTER TABLE recurring_invoice_occurrences ADD CONSTRAINT recurring_invoice_occurrences_state_check CHECK(state IN ('pending','processing','draft','issued','queued','sent','failed'));
CREATE TABLE vendor_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),vendor_id uuid NOT NULL,vendor_snapshot jsonb NOT NULL,supplier_number text NOT NULL CHECK(length(btrim(supplier_number)) BETWEEN 1 AND 100),
 issue_date date NOT NULL,due_date date NOT NULL,currency varchar(3) NOT NULL,currency_scale integer NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','open','void')),
 subtotal numeric(19,4) NOT NULL,discount_total numeric(19,4) NOT NULL,tax_total numeric(19,4) NOT NULL,total numeric(19,4) NOT NULL CHECK(total>0),
 issued_at timestamptz,void_effective_on date,void_reason text,version integer NOT NULL DEFAULT 1,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,vendor_id) REFERENCES business_contacts(workspace_id,id),CHECK(due_date>=issue_date)
);
CREATE UNIQUE INDEX vendor_bills_supplier_number ON vendor_bills(workspace_id,vendor_id,lower(supplier_number));
CREATE TABLE vendor_bill_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,bill_id uuid NOT NULL,position integer NOT NULL,description text NOT NULL,quantity numeric(19,4) NOT NULL,unit_price numeric(19,4) NOT NULL,discount_amount numeric(19,4) NOT NULL,tax_rate numeric(7,4) NOT NULL,
 net_amount numeric(19,4) NOT NULL,tax_amount numeric(19,4) NOT NULL,total_amount numeric(19,4) NOT NULL,tax_snapshot jsonb,
 UNIQUE(workspace_id,id),UNIQUE(bill_id,position),FOREIGN KEY(workspace_id,bill_id) REFERENCES vendor_bills(workspace_id,id)
);
CREATE TABLE vendor_bill_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,bill_id uuid NOT NULL,transaction_id uuid NOT NULL,amount numeric(19,4) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,paid_on date NOT NULL,
 idempotency_key text NOT NULL,request_hash text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),reversed_at timestamptz,reversal_effective_on date,reversal_reason text,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,transaction_id),UNIQUE(workspace_id,idempotency_key),FOREIGN KEY(workspace_id,bill_id) REFERENCES vendor_bills(workspace_id,id),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE TABLE business_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),client_id uuid,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,client_id) REFERENCES business_contacts(workspace_id,id)
);
CREATE TABLE project_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,project_id uuid NOT NULL,transaction_id uuid,invoice_line_id uuid,amount numeric(19,4) NOT NULL CHECK(amount>0),currency varchar(3) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((transaction_id IS NULL)<>(invoice_line_id IS NULL)),UNIQUE(project_id,transaction_id),UNIQUE(project_id,invoice_line_id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES business_projects(workspace_id,id),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id),FOREIGN KEY(workspace_id,invoice_line_id) REFERENCES invoice_lines(workspace_id,id)
);
CREATE TABLE business_tax_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),due_on date NOT NULL,completed_at timestamptz,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['vendor_bills','vendor_bill_lines','vendor_bill_payments','business_projects','project_allocations','business_tax_reminders'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY business_operations_scope ON %I USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',t);
 EXECUTE format('CREATE TRIGGER active_workspace_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',t);
END LOOP;END $$;
