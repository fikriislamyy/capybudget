ALTER TABLE payment_connections DROP CONSTRAINT payment_connections_provider_check;
--> statement-breakpoint
ALTER TABLE payment_connections ADD CONSTRAINT payment_connections_provider_check CHECK(provider IN ('doku','pakasir'));
--> statement-breakpoint
ALTER TABLE payment_connections ALTER COLUMN provider SET DEFAULT 'pakasir';
--> statement-breakpoint
ALTER TABLE payment_connections ADD COLUMN webhook_secret text;
--> statement-breakpoint
ALTER TABLE payment_connections ADD CONSTRAINT payment_connections_pakasir_secret_check CHECK(provider <> 'pakasir' OR webhook_secret IS NOT NULL);
--> statement-breakpoint
DROP INDEX payment_connections_active;
--> statement-breakpoint
CREATE UNIQUE INDEX payment_connections_active ON payment_connections(workspace_id,provider,sandbox) WHERE disabled_at IS NULL;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN provider_txn_id text;
