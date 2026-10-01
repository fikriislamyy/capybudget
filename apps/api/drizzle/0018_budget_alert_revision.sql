ALTER TABLE budgets
  ADD COLUMN alert_revision integer NOT NULL DEFAULT 1;

ALTER TABLE budgets
  ADD CONSTRAINT budgets_alert_revision_positive CHECK (alert_revision > 0);
