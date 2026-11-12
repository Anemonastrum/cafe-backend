ALTER TABLE payments ADD COLUMN request_hash CHAR(64) NULL;
ALTER TABLE receipts ADD COLUMN cashier_name_snapshot VARCHAR(150) NULL;
