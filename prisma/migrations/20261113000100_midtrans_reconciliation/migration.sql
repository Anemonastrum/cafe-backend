-- Additive provider evidence; no historical snapshot backfill or issuer rewrite.
ALTER TABLE `orders` ADD COLUMN `reconciliation_hold` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `payments`
  ADD COLUMN `gateway_attempt_snapshot` JSON NULL,
  ADD COLUMN `gateway_charge_started_at` DATETIME(3) NULL;
ALTER TABLE `receipts` MODIFY COLUMN `issued_by_user_id` BIGINT UNSIGNED NULL;
