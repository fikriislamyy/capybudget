ALTER TABLE assistant_suggestions DROP CONSTRAINT assistant_suggestions_kind_check;
--> statement-breakpoint
ALTER TABLE assistant_suggestions ADD CONSTRAINT assistant_suggestions_kind_check CHECK(kind IN ('shortfall','low_balance','invoice_followup','savings','categorization','payment_delay'));
