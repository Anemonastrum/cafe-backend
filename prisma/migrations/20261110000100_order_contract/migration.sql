ALTER TABLE orders ADD COLUMN request_hash CHAR(64) NULL;
ALTER TABLE order_items ADD COLUMN pricing_snapshot JSON NULL;
