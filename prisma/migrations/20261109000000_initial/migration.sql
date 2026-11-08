-- Café POS backend schema | MySQL 8.0.16+ (InnoDB, utf8mb4)
-- Roles: admin / cashier. No stock, table-management, refunds, or shift cash reconciliation.
-- Money is DECIMAL (IDR); never use floating-point amounts.
-- Orders, line items, taxes, discounts, and receipts retain price/name snapshots.
-- Run on a NEW database. Do not run against an existing production schema.

-- 1. Users / secure login
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(60) NOT NULL,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','cashier') NOT NULL DEFAULT 'cashier',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Store only hashes of opaque refresh/session tokens, never raw tokens.
CREATE TABLE auth_sessions (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token (token_hash),
  KEY idx_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Catalog, pricing, tax configuration
CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- rate_percent: 11.00 means 11%, not 0.11.
CREATE TABLE taxes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  is_inclusive TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_taxes_name (name),
  CONSTRAINT chk_taxes_rate CHECK (rate_percent >= 0 AND rate_percent <= 100)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE service_charges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  calculation ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  value DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_auto_applied TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_charges_name (name),
  CONSTRAINT chk_service_charges_value CHECK (value >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Order-level manual or promotional discounts. Product promo_price is separate.
CREATE TABLE discounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) NULL,
  calculation ENUM('percent','fixed') NOT NULL,
  value DECIMAL(14,2) NOT NULL,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_discounts_code (code),
  CONSTRAINT chk_discounts_value CHECK (value >= 0),
  CONSTRAINT chk_discounts_dates CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(80) NOT NULL,
  provider ENUM('manual','midtrans') NOT NULL DEFAULT 'manual',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_methods_code (code)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Single-café deployment. Keep API keys in environment/secrets manager.
CREATE TABLE cafe_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  cafe_name VARCHAR(180) NOT NULL,
  cafe_address TEXT NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(190) NULL,
  logo_url VARCHAR(1024) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  default_tax_id BIGINT UNSIGNED NULL,
  receipt_footer VARCHAR(500) NULL,
  receipt_paper_mm ENUM('58','80') NOT NULL DEFAULT '80',
  order_prefix VARCHAR(15) NOT NULL DEFAULT 'ORD',
  next_order_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
  cashier_can_discount TINYINT(1) NOT NULL DEFAULT 0,
  cashier_can_cancel TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_settings_tax FOREIGN KEY (default_tax_id) REFERENCES taxes(id) ON DELETE SET NULL,
  CONSTRAINT chk_single_cafe CHECK (id = 1),
  CONSTRAINT chk_next_order_number CHECK (next_order_number > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  tax_id BIGINT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  sku VARCHAR(64) NULL,
  description TEXT NULL,
  image_url VARCHAR(1024) NULL,
  base_price DECIMAL(14,2) NOT NULL,
  promo_price DECIMAL(14,2) NULL,
  promo_starts_at DATETIME(3) NULL,
  promo_ends_at DATETIME(3) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  archived_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_visible (is_enabled, archived_at, category_id),
  KEY idx_products_name (name),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_products_tax FOREIGN KEY (tax_id) REFERENCES taxes(id) ON DELETE SET NULL,
  CONSTRAINT chk_products_base_price CHECK (base_price >= 0),
  CONSTRAINT chk_products_promo_price CHECK (promo_price IS NULL OR (promo_price >= 0 AND promo_price <= base_price))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A product can require one option from multiple groups, e.g. Size + Temperature.
CREATE TABLE product_variant_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variant_group_name (product_id, name),
  CONSTRAINT fk_variant_group_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- price_delta may be negative; final sell price must be >= 0 (validate in backend).
CREATE TABLE product_variant_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  price_delta DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variant_option_name (group_id, name),
  CONSTRAINT fk_variant_option_group FOREIGN KEY (group_id) REFERENCES product_variant_groups(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE product_addon_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  min_select SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_select SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addon_group_name (product_id, name),
  CONSTRAINT fk_addon_group_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT chk_addon_group_selection CHECK (max_select >= min_select)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE product_addon_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  price DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addon_option_name (group_id, name),
  CONSTRAINT fk_addon_option_group FOREIGN KEY (group_id) REFERENCES product_addon_groups(id) ON DELETE RESTRICT,
  CONSTRAINT chk_addon_option_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Cash register assignment and cashier shifts (time tracking only)
CREATE TABLE cash_registers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_register_code (code)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE cashier_shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cashier_id BIGINT UNSIGNED NOT NULL,
  cash_register_id BIGINT UNSIGNED NOT NULL,
  opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_at DATETIME(3) NULL,
  closed_by_user_id BIGINT UNSIGNED NULL,
  closing_notes TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_shifts_cashier_time (cashier_id, opened_at),
  KEY idx_shifts_register_status (cash_register_id, status),
  CONSTRAINT fk_shifts_cashier FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shifts_register FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shifts_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Orders and immutable checkout snapshots
CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(48) NOT NULL,
  client_request_id CHAR(36) NOT NULL,
  cashier_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NULL,
  order_type ENUM('dine_in','takeaway') NOT NULL,
  status ENUM('pending','preparing','ready','completed','cancelled') NOT NULL DEFAULT 'pending',
  is_held TINYINT(1) NOT NULL DEFAULT 0,
  payment_status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  item_discount_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  order_discount_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  service_charge_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  cancel_reason VARCHAR(500) NULL,
  cancelled_by_user_id BIGINT UNSIGNED NULL,
  cancel_approved_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  UNIQUE KEY uq_orders_request (client_request_id),
  KEY idx_orders_created (created_at),
  KEY idx_orders_status_created (status, created_at),
  KEY idx_orders_cashier_created (cashier_id, created_at),
  KEY idx_orders_shift (shift_id),
  KEY idx_orders_payment_status (payment_status, paid_at),
  CONSTRAINT fk_orders_cashier FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_shift FOREIGN KEY (shift_id) REFERENCES cashier_shifts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_cancelled_by FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_cancel_approved FOREIGN KEY (cancel_approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_orders_totals CHECK (subtotal >= 0 AND item_discount_total >= 0 AND order_discount_total >= 0 AND tax_total >= 0 AND service_charge_total >= 0 AND grand_total >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  sku_snapshot VARCHAR(64) NULL,
  category_name VARCHAR(120) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  base_unit_price DECIMAL(14,2) NOT NULL,
  variant_unit_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  addon_unit_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_subtotal DECIMAL(14,2) NOT NULL,
  discount_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL,
  special_instructions TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT chk_order_item_qty CHECK (quantity > 0),
  CONSTRAINT chk_order_item_amounts CHECK (base_unit_price >= 0 AND addon_unit_total >= 0 AND line_subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_item_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT UNSIGNED NOT NULL,
  variant_option_id BIGINT UNSIGNED NOT NULL,
  group_name VARCHAR(120) NOT NULL,
  option_name VARCHAR(120) NOT NULL,
  price_delta DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_variant_option (order_item_id, variant_option_id),
  CONSTRAINT fk_item_variant_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_item_variant_option FOREIGN KEY (variant_option_id) REFERENCES product_variant_options(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_item_addons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT UNSIGNED NOT NULL,
  addon_option_id BIGINT UNSIGNED NOT NULL,
  group_name VARCHAR(120) NOT NULL,
  option_name VARCHAR(120) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_addon_option (order_item_id, addon_option_id),
  CONSTRAINT fk_item_addon_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_item_addon_option FOREIGN KEY (addon_option_id) REFERENCES product_addon_options(id) ON DELETE RESTRICT,
  CONSTRAINT chk_item_addon_qty CHECK (quantity > 0),
  CONSTRAINT chk_item_addon_amounts CHECK (unit_price >= 0 AND line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_discounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  calculation ENUM('percent','fixed') NOT NULL,
  configured_value DECIMAL(14,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  applied_by_user_id BIGINT UNSIGNED NOT NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_discounts_order (order_id),
  CONSTRAINT fk_order_discount_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_discount_rule FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_discount_applied FOREIGN KEY (applied_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_discount_approved FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_discounts_amount CHECK (configured_value >= 0 AND amount >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_taxes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  tax_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  rate_percent DECIMAL(7,4) NOT NULL,
  is_inclusive TINYINT(1) NOT NULL,
  taxable_amount DECIMAL(14,2) NOT NULL,
  tax_amount DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_taxes_order (order_id),
  CONSTRAINT fk_order_tax_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_tax_rule FOREIGN KEY (tax_id) REFERENCES taxes(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_taxes_amount CHECK (taxable_amount >= 0 AND tax_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_service_charges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  service_charge_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  calculation ENUM('percent','fixed') NOT NULL,
  configured_value DECIMAL(14,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_charges_order (order_id),
  CONSTRAINT fk_order_charge_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_charge_rule FOREIGN KEY (service_charge_id) REFERENCES service_charges(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_charges_amount CHECK (configured_value >= 0 AND amount >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('pending','preparing','ready','completed','cancelled') NULL,
  to_status ENUM('pending','preparing','ready','completed','cancelled') NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  notes VARCHAR(500) NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_status_history_order (order_id, changed_at),
  CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Payments and gateway callbacks
CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  payment_reference VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  cash_received DECIMAL(14,2) NULL,
  cash_change DECIMAL(14,2) NULL,
  status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  provider ENUM('manual','midtrans') NOT NULL DEFAULT 'manual',
  gateway_order_id VARCHAR(120) NULL,
  gateway_transaction_id VARCHAR(120) NULL,
  gateway_status VARCHAR(80) NULL,
  processed_by_user_id BIGINT UNSIGNED NOT NULL,
  paid_at DATETIME(3) NULL,
  failed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_reference (payment_reference),
  UNIQUE KEY uq_payments_idempotency (idempotency_key),
  UNIQUE KEY uq_payments_gateway_order (gateway_order_id),
  UNIQUE KEY uq_payments_gateway_transaction (gateway_transaction_id),
  KEY idx_payments_order_status (order_id, status),
  KEY idx_payments_method_paid (payment_method_id, paid_at),
  KEY idx_payments_shift (shift_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_shift FOREIGN KEY (shift_id) REFERENCES cashier_shifts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_cash CHECK ((cash_received IS NULL AND cash_change IS NULL) OR (cash_received IS NOT NULL AND cash_change IS NOT NULL AND cash_received >= 0 AND cash_change >= 0))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Sanitize payload: no credentials, raw card data or secrets.
CREATE TABLE payment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  provider_event_id VARCHAR(150) NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSON NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_events_provider_id (provider_event_id),
  KEY idx_payment_events_payment_time (payment_id, received_at),
  CONSTRAINT fk_payment_event_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Receipt data / reprint history. HTML/PDF generated in application.
CREATE TABLE receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(80) NOT NULL,
  cafe_name_snapshot VARCHAR(180) NOT NULL,
  cafe_address_snapshot TEXT NULL,
  cafe_phone_snapshot VARCHAR(50) NULL,
  currency_snapshot CHAR(3) NOT NULL DEFAULT 'IDR',
  paper_mm ENUM('58','80') NOT NULL DEFAULT '80',
  footer_snapshot VARCHAR(500) NULL,
  pdf_url VARCHAR(1024) NULL,
  digital_delivery_email VARCHAR(190) NULL,
  delivery_status ENUM('not_requested','pending','sent','failed') NOT NULL DEFAULT 'not_requested',
  issued_by_user_id BIGINT UNSIGNED NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipts_payment (payment_id),
  UNIQUE KEY uq_receipts_number (receipt_number),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipts_user FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE receipt_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_id BIGINT UNSIGNED NOT NULL,
  action ENUM('print','reprint','pdf_export','email_sent','email_failed') NOT NULL,
  acted_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_receipt_events_receipt_time (receipt_id, created_at),
  CONSTRAINT fk_receipt_event_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipt_event_user FOREIGN KEY (acted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Immutable audit trail for sensitive operations
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_user_time (user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Safe reference data. No default admin password or live gateway credentials.
INSERT INTO payment_methods (code, name, provider) VALUES
  ('cash', 'Cash', 'manual'),
  ('qris', 'QRIS', 'manual');
INSERT INTO cafe_settings (id, cafe_name) VALUES (1, 'My Café');
INSERT INTO cash_registers (name, code) VALUES ('Main Register', 'MAIN');

-- IMPORTANT APPLICATION TRANSACTION RULES:
-- 1) Always authorize admin-only operations server-side.
-- 2) For next order_number, SELECT the cafe_settings row FOR UPDATE, increment atomically,
--    and use a UNIQUE order_number + UNIQUE client_request_id in the same transaction.
-- 3) For checkout, lock the order row (SELECT ... FOR UPDATE), verify unpaid/not cancelled,
--    validate totals server-side, and create exactly one effective paid transaction.
-- 4) For Midtrans webhooks, verify signature/status server-side, dedupe callback events,
--    and update payment/order/receipt atomically. Do not trust browser success responses.
-- 5) Lock cash_registers/users rows when opening shifts to prevent concurrent open shifts.
--    Shifts record opening/closing times only, not opening float or cash reconciliation.
-- 6) Validate variant/add-on ownership, selections, promos, tax rounding and cash change.
-- 7) Preserve transaction history: archive/disable products; don't hard-delete referenced data.
-- 8) Snapshot order details before settlement. Freeze paid orders (only preparation status updates).
-- 9) Totals: grand_total = subtotal - item_discount_total - order_discount_total
--           + exclusive_tax_total + service_charge_total (inclusive tax is already in prices).
-- 10) Reports/dashboard are derived using orders, order_items, payments and shifts.
--     Shift summaries may aggregate paid transactions, but do not reconcile cash drawers.
