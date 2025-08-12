CREATE DATABASE IF NOT EXISTS invoice_system;
USE invoice_system;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;

CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(50),
  bill_to VARCHAR(255),
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  tin VARCHAR(50),
  terms VARCHAR(50),
  date DATE,
  total_amount_due DECIMAL(12,2)
);

CREATE TABLE invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT,
  description TEXT,
  quantity INT,
  unit_price DECIMAL(12,2),
  amount DECIMAL(12,2),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT,
  cash BOOLEAN DEFAULT FALSE,
  check_payment BOOLEAN DEFAULT FALSE,
  check_no VARCHAR(50),
  bank VARCHAR(100),
  vatable_sales DECIMAL(12,2),
  total_sales DECIMAL(12,2),
  vat_exempt DECIMAL(12,2),
  less_vat DECIMAL(12,2),
  zero_rated DECIMAL(12,2),
  net_vat DECIMAL(12,2),
  vat_amount DECIMAL(12,2),
  withholding DECIMAL(12,2),
  total DECIMAL(12,2),
  due DECIMAL(12,2),
  pay_date DATE,
  payable DECIMAL(12,2),

  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
