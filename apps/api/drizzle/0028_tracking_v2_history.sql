-- Keep posted conversion provenance immutable, including actual bank conversion and explicit fees.
ALTER TABLE transaction_fx_snapshots ADD COLUMN actual_transfer_rate numeric(28,12),ADD COLUMN rounding_adjustment numeric(28,12),ADD COLUMN fee_transaction_id uuid;
ALTER TABLE transaction_fx_snapshots ADD CONSTRAINT transaction_fx_fee_fk FOREIGN KEY(workspace_id,fee_transaction_id) REFERENCES transactions(workspace_id,id);
CREATE TRIGGER transaction_fx_history_immutable BEFORE UPDATE OR DELETE ON transaction_fx_snapshots FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
CREATE FUNCTION reject_exchange_rate_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Dated rate observations are immutable'; END $$;
CREATE TRIGGER exchange_rate_history_immutable BEFORE UPDATE OR DELETE ON exchange_rates FOR EACH ROW EXECUTE FUNCTION reject_exchange_rate_mutation();
CREATE INDEX capture_import_queue_idx ON import_jobs(status,created_at) WHERE status='queued';
CREATE INDEX capture_ocr_queue_idx ON ocr_jobs(status,created_at) WHERE status='queued';
