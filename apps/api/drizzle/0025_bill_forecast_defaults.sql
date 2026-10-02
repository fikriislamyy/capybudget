ALTER TABLE bills ADD COLUMN expected_payment_offset_days integer;
ALTER TABLE bills ADD COLUMN deferrable_offset_days integer;
ALTER TABLE bills ADD CONSTRAINT bills_expected_offset_check CHECK (expected_payment_offset_days BETWEEN -365 AND 365);
ALTER TABLE bills ADD CONSTRAINT bills_deferrable_offset_check CHECK (deferrable_offset_days BETWEEN 0 AND 365);
