-- Forecast defaults follow the same exact-name/calendar-day key as the bills list.
CREATE TABLE bill_group_forecast_settings (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 payment_account_id uuid,
 has_payment_account boolean NOT NULL DEFAULT false,
 expected_payment_offset_days integer CHECK(expected_payment_offset_days BETWEEN -365 AND 365),
 has_expected_offset boolean NOT NULL DEFAULT false,
 deferrable_offset_days integer CHECK(deferrable_offset_days BETWEEN 0 AND 365),
 has_deferrable_offset boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,name,due_day),
 FOREIGN KEY(workspace_id,payment_account_id) REFERENCES accounts(workspace_id,id) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE bill_group_forecast_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_group_forecast_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY bill_group_forecast_tenant ON bill_group_forecast_settings
 USING(workspace_id=current_setting('app.workspace_id',true)::uuid)
 WITH CHECK(workspace_id=current_setting('app.workspace_id',true)::uuid);
--> statement-breakpoint
-- Materialized future bills inherit group defaults, including bills created later.
CREATE FUNCTION apply_bill_group_forecast_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE defaults bill_group_forecast_settings%ROWTYPE;
BEGIN
 SELECT * INTO defaults FROM bill_group_forecast_settings
 WHERE workspace_id=NEW.workspace_id AND name=NEW.name AND due_day=extract(day from NEW.due_on)::integer;
 IF FOUND AND NEW.status='unpaid' AND NEW.transaction_id IS NULL THEN
  IF defaults.has_payment_account AND NEW.payment_account_id IS NULL THEN NEW.payment_account_id=defaults.payment_account_id; END IF;
  IF defaults.has_expected_offset AND NEW.expected_payment_on IS NULL THEN NEW.expected_payment_on=NEW.due_on+defaults.expected_payment_offset_days; END IF;
  IF defaults.has_deferrable_offset AND NEW.deferrable_until IS NULL THEN NEW.deferrable_until=NEW.due_on+defaults.deferrable_offset_days; END IF;
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bill_group_forecast_defaults BEFORE INSERT ON bill_occurrences
 FOR EACH ROW EXECUTE FUNCTION apply_bill_group_forecast_defaults();
