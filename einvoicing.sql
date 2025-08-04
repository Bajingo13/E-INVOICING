CREATE DATABASE IF NOT EXISTS invoice_system;
USE invoice_system;

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