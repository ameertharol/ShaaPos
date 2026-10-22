CREATE DATABASE IF NOT EXISTS northstar_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE northstar_pos;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT '',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(12,3) NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_products_name(name), INDEX idx_products_stock(stock)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  type ENUM('customer','supplier') NOT NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contacts_name(name), INDEX idx_contacts_type(type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  type ENUM('asset','liability','equity','income','expense') NOT NULL DEFAULT 'asset',
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_no VARCHAR(40) NOT NULL UNIQUE,
  type ENUM('purchase','purchase_return','sale','sale_return','receipt','payment','journal') NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  entity_name VARCHAR(180) NOT NULL DEFAULT '',
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'posted',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_documents_type_date(type,created_at), INDEX idx_documents_entity(entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_items_document FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO accounts(code,name,type,balance) VALUES
('1000','Cash on hand','asset',0),('1100','Accounts receivable','asset',0),('2000','Accounts payable','liability',0),('4000','Retail sales','income',0),('5000','Cost of goods sold','expense',0);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
