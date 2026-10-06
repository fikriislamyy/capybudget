ALTER TABLE payment_requests ADD COLUMN net_settlement_source_id uuid,ADD COLUMN net_settlement_hash text;
ALTER TABLE payment_requests ADD FOREIGN KEY(workspace_id,net_settlement_source_id) REFERENCES transactions(workspace_id,id);
CREATE UNIQUE INDEX payment_requests_net_source ON payment_requests(workspace_id,net_settlement_source_id) WHERE net_settlement_source_id IS NOT NULL;
