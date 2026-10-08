-- Entry rows have id; line rows have entry_id. Reading both fields in a CASE
-- expression plans the nonexistent field even when that branch is not selected.
CREATE OR REPLACE FUNCTION capybudget_accounting_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws uuid; entry uuid; BEGIN
 ws=NEW.workspace_id;
 IF TG_TABLE_NAME='business_accounting_entries' THEN entry=NEW.id;
 ELSE entry=NEW.entry_id; END IF;
 IF (SELECT count(*) FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry)<2
 OR EXISTS(SELECT 1 FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry GROUP BY currency HAVING sum(debit)<>sum(credit))
 OR EXISTS(SELECT 1 FROM business_accounting_lines WHERE workspace_id=ws AND entry_id=entry HAVING sum(base_debit)<>sum(base_credit)) THEN
 RAISE EXCEPTION 'Accrual adjustment must balance in native and base currency' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
