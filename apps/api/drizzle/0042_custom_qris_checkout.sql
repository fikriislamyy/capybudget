ALTER TABLE payment_requests ADD COLUMN checkout_method text NOT NULL DEFAULT 'hosted' CHECK(checkout_method IN ('hosted','qris'));
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN public_token text UNIQUE;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN qr_string text;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN provider_fee numeric(19,4);
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN total_payment numeric(19,4);
--> statement-breakpoint
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_qris_check CHECK(checkout_method <> 'qris' OR (qris_only AND public_token IS NOT NULL AND public_token ~ '^[0-9a-f]{64}$'));
