CREATE TABLE business_profiles (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 legal_name text NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 1 AND 200),
 trading_name text, address jsonb NOT NULL DEFAULT '{}'::jsonb, contact_email text, phone text, tax_id text,
 logo_document_id uuid, fiscal_year_start_month integer NOT NULL DEFAULT 1 CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
 fiscal_year_start_day integer NOT NULL DEFAULT 1 CHECK(fiscal_year_start_day BETWEEN 1 AND 28),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO business_profiles(workspace_id,legal_name)
SELECT id,name FROM workspaces WHERE kind='business' ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE invoice_number_sequences (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 series text NOT NULL DEFAULT 'INV' CHECK(series ~ '^[A-Z0-9]{1,8}$'),
 next_value bigint NOT NULL DEFAULT 1 CHECK(next_value>0),
 PRIMARY KEY(workspace_id,series)
);
--> statement-breakpoint
CREATE TABLE invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 number text, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','issued','void')),
 issue_date date NOT NULL, due_date date NOT NULL, currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 currency_scale smallint NOT NULL DEFAULT 2 CHECK(currency_scale BETWEEN 0 AND 4),
 seller_snapshot jsonb, recipient_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','id')),
 notes text, payment_instructions text,
 subtotal numeric(19,4) NOT NULL DEFAULT 0 CHECK(subtotal>=0), discount_total numeric(19,4) NOT NULL DEFAULT 0 CHECK(discount_total>=0),
 tax_total numeric(19,4) NOT NULL DEFAULT 0 CHECK(tax_total>=0), total numeric(19,4) NOT NULL DEFAULT 0 CHECK(total>=0),
 issued_at timestamptz, first_sent_at timestamptz, voided_at timestamptz, void_effective_on date, void_reason text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_by text REFERENCES "user"(id), updated_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,number),
 FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
 CHECK(due_date>=issue_date),
 CHECK((state='draft' AND number IS NULL AND issued_at IS NULL) OR (state IN ('issued','void') AND number IS NOT NULL AND issued_at IS NOT NULL)),
 CHECK((state='void' AND voided_at IS NOT NULL AND void_effective_on IS NOT NULL AND length(btrim(coalesce(void_reason,'')))>0) OR state<>'void')
);
--> statement-breakpoint
CREATE INDEX invoices_workspace_due_idx ON invoices(workspace_id,state,due_date);
--> statement-breakpoint
CREATE TABLE invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, invoice_id uuid NOT NULL, position integer NOT NULL CHECK(position BETWEEN 0 AND 99),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),
 quantity numeric(19,4) NOT NULL CHECK(quantity>0), unit_price numeric(19,4) NOT NULL CHECK(unit_price>=0),
 discount_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100),
 net_amount numeric(19,4) NOT NULL CHECK(net_amount>=0), tax_amount numeric(19,4) NOT NULL CHECK(tax_amount>=0), total_amount numeric(19,4) NOT NULL CHECK(total_amount>=0),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,invoice_id,position),
 FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE CASCADE,
 CHECK(discount_amount<=quantity*unit_price), CHECK(total_amount=net_amount+tax_amount)
);
--> statement-breakpoint
CREATE TABLE business_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), invoice_id uuid,
 kind text NOT NULL CHECK(kind IN ('logo','invoice_pdf')), source_version integer, template_version integer NOT NULL DEFAULT 1,
 object_key text NOT NULL UNIQUE, mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp','application/pdf')),
 byte_size bigint CHECK(byte_size>0), checksum text, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id),
 CHECK((kind='logo' AND invoice_id IS NULL AND mime_type<>'application/pdf') OR (kind='invoice_pdf' AND invoice_id IS NOT NULL AND mime_type='application/pdf'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX business_documents_pdf_version_unique ON business_documents(workspace_id,invoice_id,source_version,template_version) WHERE kind='invoice_pdf';
--> statement-breakpoint
CREATE TABLE invoice_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, invoice_id uuid NOT NULL, transaction_id uuid NOT NULL,
 account_id uuid NOT NULL, category_id uuid NOT NULL, amount numeric(19,4) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 paid_on date NOT NULL, reference text, created_by text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 reversed_at timestamptz, reversed_by text REFERENCES "user"(id), reversal_reason text, reversal_effective_on date,
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,transaction_id),
 FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id),
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id),
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id),
 CHECK((reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL AND reversal_effective_on IS NULL) OR
       (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND length(btrim(coalesce(reversal_reason,'')))>0 AND reversal_effective_on IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX invoice_payments_invoice_idx ON invoice_payments(workspace_id,invoice_id,paid_on);
--> statement-breakpoint
CREATE TABLE invoice_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, invoice_id uuid NOT NULL, document_id uuid NOT NULL,
 requested_by text NOT NULL REFERENCES "user"(id), recipient_snapshot text NOT NULL CHECK(length(recipient_snapshot)<=320),
 locale text NOT NULL CHECK(locale IN ('en','id')), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','queued','sending','accepted','failed','cancelled','uncertain')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 accepted_at timestamptz, provider_message_id text, error_code text, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,idempotency_key),
 FOREIGN KEY(workspace_id,invoice_id) REFERENCES invoices(workspace_id,id),
 FOREIGN KEY(workspace_id,document_id) REFERENCES business_documents(workspace_id,id)
);
--> statement-breakpoint
CREATE INDEX invoice_deliveries_pending_idx ON invoice_deliveries(state,next_attempt_at);
--> statement-breakpoint
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE business_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY business_profiles_tenant ON business_profiles USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=business_profiles.workspace_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=business_profiles.workspace_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
--> statement-breakpoint
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['invoice_number_sequences','invoices','invoice_lines','business_documents','invoice_payments','invoice_deliveries'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY business_tenant ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
 END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_logo_fk FOREIGN KEY(workspace_id,logo_document_id) REFERENCES business_documents(workspace_id,id);
