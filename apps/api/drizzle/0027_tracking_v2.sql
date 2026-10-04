-- Expand only: legacy journal rows retain their original amounts unchanged.
ALTER TABLE transactions ADD COLUMN base_amount numeric(19,4), ADD COLUMN base_currency varchar(3), ADD COLUMN destination_amount numeric(19,4);
ALTER TABLE journal_lines ADD COLUMN base_debit numeric(19,4), ADD COLUMN base_credit numeric(19,4);
ALTER TABLE transactions DROP CONSTRAINT transactions_type_shape_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_shape_check CHECK(
 (type IN ('income','expense') AND destination_account_id IS NULL) OR
 (type='transfer' AND category_id IS NULL AND destination_account_id IS NOT NULL AND destination_account_id<>account_id));
CREATE TABLE exchange_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_currency varchar(3) NOT NULL, base_currency varchar(3) NOT NULL,
 rate_date date NOT NULL, rate numeric(28,12) NOT NULL CHECK(rate>0), provider text NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_currency,base_currency,rate_date,provider,rate)
);
CREATE TABLE transaction_fx_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id), transaction_id uuid NOT NULL,
 revision integer NOT NULL, source_currency varchar(3) NOT NULL, base_currency varchar(3) NOT NULL, source_amount numeric(19,4) NOT NULL,
 base_amount numeric(19,4) NOT NULL, rate numeric(28,12) NOT NULL, rate_date date NOT NULL,provider text NOT NULL,
 destination_currency varchar(3),destination_amount numeric(19,4),destination_base_amount numeric(19,4),destination_rate numeric(28,12),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,transaction_id,revision),
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE TABLE transaction_splits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,transaction_id uuid NOT NULL,category_id uuid NOT NULL,
 amount numeric(19,4) NOT NULL CHECK(amount>0),base_amount numeric(19,4) NOT NULL CHECK(base_amount>=0),notes text,position integer NOT NULL,
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id),
 FOREIGN KEY(workspace_id,category_id) REFERENCES categories(workspace_id,id),UNIQUE(workspace_id,transaction_id,position)
);
CREATE TABLE bulk_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),actor_user_id text NOT NULL REFERENCES "user"(id),
 action text NOT NULL CHECK(action IN ('edit','delete','restore')), request jsonb NOT NULL,request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','applied')),result jsonb,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz
);
CREATE TABLE import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),actor_user_id text NOT NULL REFERENCES "user"(id),
 account_id uuid NOT NULL,source_kind text NOT NULL CHECK(source_kind IN ('csv','xlsx','pdf','image')),object_key text,checksum text,
 file_name text NOT NULL,mapping jsonb,parser_version text NOT NULL DEFAULT 'tracking-v2-1',status text NOT NULL DEFAULT 'uploaded',
 error text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 FOREIGN KEY(workspace_id,account_id) REFERENCES accounts(workspace_id,id), UNIQUE(workspace_id,id)
);
CREATE TABLE import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,job_id uuid NOT NULL,row_number integer NOT NULL,
 raw jsonb,normalized jsonb,fingerprint text,status text NOT NULL DEFAULT 'review',error text,transaction_id uuid,
 FOREIGN KEY(workspace_id,job_id) REFERENCES import_jobs(workspace_id,id),
 FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id),UNIQUE(workspace_id,job_id,row_number)
);
CREATE TABLE ocr_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),actor_user_id text NOT NULL REFERENCES "user"(id),
 object_key text NOT NULL,mime_type text NOT NULL,file_name text NOT NULL,checksum text NOT NULL,size_bytes integer NOT NULL,
 status text NOT NULL DEFAULT 'queued',extracted jsonb,error text,transaction_id uuid,created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,id)
);
CREATE INDEX import_review_idx ON import_rows(workspace_id,job_id,row_number);
CREATE VIEW tracking_allocations WITH (security_invoker=true) AS
 SELECT t.workspace_id,t.id,t.type,t.occurred_at,t.deleted_at,t.currency,t.category_id,t.amount,t.updated_at FROM transactions t WHERE NOT EXISTS(SELECT 1 FROM transaction_splits s WHERE s.workspace_id=t.workspace_id AND s.transaction_id=t.id)
 UNION ALL SELECT t.workspace_id,t.id,t.type,t.occurred_at,t.deleted_at,t.currency,s.category_id,s.amount,t.updated_at FROM transactions t JOIN transaction_splits s ON s.workspace_id=t.workspace_id AND s.transaction_id=t.id
 UNION ALL SELECT t.workspace_id,t.id,t.type,t.occurred_at,t.deleted_at,t.base_currency,t.category_id,t.base_amount,t.updated_at FROM transactions t WHERE t.base_currency IS DISTINCT FROM t.currency AND t.base_currency IS NOT NULL AND NOT EXISTS(SELECT 1 FROM transaction_splits s WHERE s.workspace_id=t.workspace_id AND s.transaction_id=t.id)
 UNION ALL SELECT t.workspace_id,t.id,t.type,t.occurred_at,t.deleted_at,t.base_currency,s.category_id,s.base_amount,t.updated_at FROM transactions t JOIN transaction_splits s ON s.workspace_id=t.workspace_id AND s.transaction_id=t.id WHERE t.base_currency IS DISTINCT FROM t.currency AND t.base_currency IS NOT NULL;
CREATE VIEW tracking_valuations WITH (security_invoker=true) AS
 SELECT t.id,t.workspace_id,t.account_id,t.destination_account_id,t.category_id,t.occurred_at,t.type,t.amount,t.currency,t.notes,t.merchant,t.deleted_at,t.version,t.created_at FROM transactions t
 UNION ALL SELECT t.id,t.workspace_id,t.account_id,t.destination_account_id,t.category_id,t.occurred_at,t.type,t.base_amount,t.base_currency,t.notes,t.merchant,t.deleted_at,t.version,t.created_at FROM transactions t WHERE t.base_currency IS DISTINCT FROM t.currency AND t.base_currency IS NOT NULL;
CREATE OR REPLACE FUNCTION assert_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; dc numeric(30,4);cc numeric(30,4);n integer;
BEGIN
 target=COALESCE(NEW.entry_id,OLD.entry_id);
 IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE id=target) THEN RETURN NULL; END IF;
 SELECT count(*),COALESCE(sum(coalesce(base_debit,debit)),0),COALESCE(sum(coalesce(base_credit,credit)),0) INTO n,dc,cc FROM journal_lines WHERE entry_id=target;
 IF n<2 OR dc<>cc THEN RAISE EXCEPTION 'journal entry must have two or more lines balanced in workspace currency'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['transaction_fx_snapshots','transaction_splits','bulk_operations','import_jobs','import_rows','ocr_jobs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=%I.workspace_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',tab,tab,tab);
 EXECUTE format('CREATE TRIGGER active_owner_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_active_workspace_write()',tab);
 END LOOP;
END $$;
ALTER TABLE journal_lines ADD CONSTRAINT journal_base_shape CHECK((base_debit IS NULL AND base_credit IS NULL) OR (base_debit>=0 AND base_credit>=0 AND (base_debit=0 OR base_credit=0)));
CREATE FUNCTION assert_tracking_allocations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;parent transactions%ROWTYPE;n integer;total numeric;bad integer;
BEGIN
 IF TG_TABLE_NAME='transactions' THEN target=COALESCE(NEW.id,OLD.id); ELSE target=COALESCE(NEW.transaction_id,OLD.transaction_id); END IF;
 SELECT * INTO parent FROM transactions WHERE id=target;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(s.amount),0),count(*) FILTER(WHERE c.type<>parent.type) INTO n,total,bad FROM transaction_splits s JOIN categories c ON c.workspace_id=s.workspace_id AND c.id=s.category_id WHERE s.workspace_id=parent.workspace_id AND s.transaction_id=target;
 IF parent.type='transfer' THEN IF n<>0 THEN RAISE EXCEPTION 'Transfers cannot be split'; END IF;
 ELSIF n=0 THEN IF parent.category_id IS NULL THEN RAISE EXCEPTION 'Choose a category or allocations'; END IF;
 ELSE IF n<2 OR n>30 OR total<>parent.amount OR bad>0 OR parent.category_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid transaction allocations'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transaction_allocations_valid AFTER INSERT OR UPDATE ON transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_tracking_allocations();
CREATE CONSTRAINT TRIGGER split_allocations_valid AFTER INSERT OR UPDATE OR DELETE ON transaction_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_tracking_allocations();
