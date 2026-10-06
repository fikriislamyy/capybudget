CREATE TABLE business_accounting_settings (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),cutover_on date NOT NULL,closed_through date,
 policy_version integer NOT NULL DEFAULT 1,activated_by text REFERENCES "user"(id),activated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(closed_through IS NULL OR closed_through>=cutover_on)
);
CREATE TABLE business_accounting_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),cutover_on date NOT NULL,
 fingerprint text NOT NULL,plan jsonb NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','applied')),
 created_by text REFERENCES "user"(id),reviewed_by text REFERENCES "user"(id),review_reference text,reviewed_at timestamptz,
 applied_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id)
);
CREATE TABLE business_accounting_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),source_key text NOT NULL,
 effective_date date NOT NULL,reason text NOT NULL,document_kind text,document_id uuid,created_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,source_key)
);
CREATE TABLE business_accounting_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,entry_id uuid NOT NULL,ledger_account_id uuid NOT NULL,
 currency varchar(3) NOT NULL,debit numeric(19,4) NOT NULL DEFAULT 0,credit numeric(19,4) NOT NULL DEFAULT 0,
 base_debit numeric(19,4) NOT NULL DEFAULT 0,base_credit numeric(19,4) NOT NULL DEFAULT 0,
 FOREIGN KEY(workspace_id,entry_id) REFERENCES business_accounting_entries(workspace_id,id),
 FOREIGN KEY(workspace_id,ledger_account_id) REFERENCES ledger_accounts(workspace_id,id),
 CHECK(debit>=0 AND credit>=0 AND base_debit>=0 AND base_credit>=0),
 CHECK(NOT(debit>0 AND credit>0) AND NOT(base_debit>0 AND base_credit>0)),
 CHECK(debit+credit+base_debit+base_credit>0)
);
CREATE TABLE business_accounting_refresh (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),kind text NOT NULL CHECK(kind IN ('invoice','vendor_bill','transaction')),
 source_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,kind,source_id)
);
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['business_accounting_settings','business_accounting_reviews','business_accounting_entries','business_accounting_lines','business_accounting_refresh'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY accounting_read ON %I FOR SELECT USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'',''viewer''))',target);
  EXECUTE format('CREATE POLICY accounting_write ON %I FOR ALL USING(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant'')) WITH CHECK(workspace_id=nullif(current_setting(''app.workspace_id'',true),'''')::uuid AND capybudget_workspace_role(workspace_id) IN (''owner'',''accountant''))',target);
 END LOOP;
END $$;
CREATE TRIGGER accounting_entries_immutable BEFORE UPDATE OR DELETE ON business_accounting_entries FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
CREATE TRIGGER accounting_lines_immutable BEFORE UPDATE OR DELETE ON business_accounting_lines FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
CREATE FUNCTION capybudget_accounting_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws uuid; entry uuid; BEGIN
 ws=NEW.workspace_id;entry=CASE WHEN TG_TABLE_NAME='business_accounting_entries' THEN NEW.id ELSE NEW.entry_id END;
 IF (SELECT count(*) FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry)<2
 OR EXISTS(SELECT 1 FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry GROUP BY currency HAVING sum(debit)<>sum(credit))
 OR EXISTS(SELECT 1 FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry HAVING sum(base_debit)<>sum(base_credit)) THEN
 RAISE EXCEPTION 'Accrual adjustment must balance in native and base currency' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accounting_entry_balanced AFTER INSERT ON business_accounting_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION capybudget_accounting_balanced();
CREATE CONSTRAINT TRIGGER accounting_lines_balanced AFTER INSERT ON business_accounting_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION capybudget_accounting_balanced();

CREATE FUNCTION capybudget_accounting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb:=to_jsonb(NEW); config business_accounting_settings; on_date date; old_item jsonb; BEGIN
 PERFORM id FROM workspaces WHERE id=NEW.workspace_id FOR SHARE;
 SELECT * INTO config FROM business_accounting_settings WHERE workspace_id=NEW.workspace_id;
 IF config.workspace_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME IN ('journal_entries','business_accounting_entries') THEN on_date=NEW.effective_date;
 ELSIF TG_TABLE_NAME IN ('invoice_payments','vendor_bill_payments','payment_refunds') THEN
  on_date=CASE WHEN TG_OP='UPDATE' AND item->>'reversal_effective_on' IS NOT NULL AND item->>'reversed_at' IS DISTINCT FROM to_jsonb(OLD)->>'reversed_at' THEN (item->>'reversal_effective_on')::date ELSE (item->>'paid_on')::date END;
  IF TG_OP='UPDATE' AND item->>'reversed_at' IS NOT DISTINCT FROM to_jsonb(OLD)->>'reversed_at' THEN RETURN NEW; END IF;
 ELSE
  IF TG_OP='UPDATE' THEN old_item=to_jsonb(OLD); END IF;
  IF item->>'state' IS NOT DISTINCT FROM old_item->>'state' THEN RETURN NEW; END IF;
  IF item->>'state'='void' THEN on_date=(item->>'void_effective_on')::date;
  ELSIF item->>'state' IN ('issued','open') THEN on_date=(item->>'issue_date')::date;
  ELSE RETURN NEW; END IF;
 END IF;
 IF on_date<config.cutover_on OR on_date<=config.closed_through THEN
 RAISE EXCEPTION 'This business date is before cutover or inside a closed accounting period. Use an open correction date.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION capybudget_accounting_queue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb:=to_jsonb(NEW); target_kind text; target_id uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM business_accounting_settings WHERE workspace_id=NEW.workspace_id) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='invoices' THEN IF NEW.issued_at IS NULL THEN RETURN NEW; END IF;target_kind='invoice';target_id=NEW.id;
 ELSIF TG_TABLE_NAME='vendor_bills' THEN IF NEW.issued_at IS NULL THEN RETURN NEW; END IF;target_kind='vendor_bill';target_id=NEW.id;
 ELSE target_kind='transaction';target_id=(item->>'transaction_id')::uuid; END IF;
 IF target_id IS NOT NULL THEN INSERT INTO business_accounting_refresh(workspace_id,kind,source_id) VALUES(NEW.workspace_id,target_kind,target_id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['journal_entries','invoices','vendor_bills','invoice_payments','vendor_bill_payments','payment_refunds'] LOOP
  EXECUTE format('CREATE TRIGGER accounting_date_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_accounting_guard()',target);
  EXECUTE format('CREATE TRIGGER accounting_refresh AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capybudget_accounting_queue()',target);
 END LOOP;
END $$;
CREATE TRIGGER accounting_adjustment_date_guard BEFORE INSERT ON business_accounting_entries FOR EACH ROW EXECUTE FUNCTION capybudget_accounting_guard();
CREATE INDEX accounting_entries_date ON business_accounting_entries(workspace_id,effective_date,id);
CREATE INDEX accounting_lines_ledger ON business_accounting_lines(workspace_id,ledger_account_id);
