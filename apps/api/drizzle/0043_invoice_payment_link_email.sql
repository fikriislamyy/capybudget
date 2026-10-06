ALTER TABLE invoice_deliveries DROP CONSTRAINT invoice_deliveries_purpose_check;
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD CONSTRAINT invoice_deliveries_purpose_check CHECK(purpose IN ('invoice','reminder','payment_link'));
--> statement-breakpoint
ALTER TABLE invoice_deliveries DROP CONSTRAINT invoice_reminder_document_check;
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD COLUMN payment_request_id uuid;
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD CONSTRAINT invoice_deliveries_payment_request_fkey FOREIGN KEY(workspace_id,payment_request_id) REFERENCES payment_requests(workspace_id,id);
--> statement-breakpoint
ALTER TABLE invoice_deliveries ADD CONSTRAINT invoice_reminder_document_check CHECK((purpose='invoice' AND document_id IS NOT NULL AND reminder_message_snapshot IS NULL AND payment_request_id IS NULL) OR (purpose='reminder' AND document_id IS NULL AND reminder_message_snapshot IS NOT NULL AND payment_request_id IS NULL) OR (purpose='payment_link' AND document_id IS NULL AND reminder_message_snapshot IS NOT NULL AND payment_request_id IS NOT NULL));
