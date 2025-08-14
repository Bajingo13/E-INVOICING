// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.json()); // parse JSON bodies
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

 
// Create DB connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'BSU2025!@',
  database: 'invoice_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper: Insert invoice and return inserted id
async function insertInvoice(conn, invoice) {
  const sql = `
    INSERT INTO invoices
      (invoice_no, bill_to, address1, address2, tin, terms, date, total_amount_due)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    invoice.invoice_no,
    invoice.bill_to,
    invoice.address1,
    invoice.address2,
    invoice.tin,
    invoice.terms,
    invoice.date,
    invoice.total_amount_due,
  ];
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

// Helper: Insert invoice items
async function insertItems(conn, invoiceId, items) {
  if (!Array.isArray(items)) return;
  const sql = `
    INSERT INTO invoice_items
      (invoice_id, description, quantity, unit_price, amount)
    VALUES (?, ?, ?, ?, ?)
  `;
  for (const item of items) {
    const params = [
      invoiceId,
      item.description,
      item.quantity,
      item.unit_price,
      item.amount,
    ];
    await conn.execute(sql, params);
  }
}

// Helper: Insert payment info
async function insertPayment(conn, invoiceId, payment) {
  if (!payment) return;
  const sql = `
    INSERT INTO payments (
      invoice_id, cash, check_payment, check_no, bank, vatable_sales, total_sales,
      vat_exempt, less_vat, zero_rated, net_vat, vat_amount, withholding, total,
      due, pay_date, payable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    invoiceId,
    payment.cash || false,
    payment.check_payment || false,
    payment.check_no || null,
    payment.bank || null,
    payment.vatable_sales || 0,
    payment.total_sales || 0,
    payment.vat_exempt || 0,
    payment.less_vat || 0,
    payment.zero_rated || 0,
    payment.net_vat || 0,
    payment.vat_amount || 0,
    payment.withholding || 0,
    payment.total || 0,
    payment.due || 0,
    payment.pay_date || null,
    payment.payable || 0,
  ];
  await conn.execute(sql, params);
}

// POST /api/invoices endpoint
app.post('/api/invoices', async (req, res) => {
  const invoiceData = req.body;

  // Basic validation (expand as needed)
  if (
    !invoiceData.invoice_no ||
    !invoiceData.bill_to ||
    !invoiceData.date ||
    !invoiceData.items ||
    !Array.isArray(invoiceData.items) ||
    invoiceData.items.length === 0
  ) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const invoiceId = await insertInvoice(conn, invoiceData);
    await insertItems(conn, invoiceId, invoiceData.items);
    await insertPayment(conn, invoiceId, invoiceData.payment);

    await conn.commit();

    res.status(201).json({ success: true, invoiceId });
  } catch (error) {
    await conn.rollback();
    console.error('Database transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// GET /invoice/:id
app.get('/invoice/:id', async (req, res) => {
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    // Get main invoice
    const [invoiceRows] = await conn.execute(
      `SELECT * FROM invoices WHERE id = ? LIMIT 1`,
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    // Get invoice items
    const [items] = await conn.execute(
      `SELECT description AS desc, quantity AS qty, unit_price AS rate, amount AS amt
       FROM invoice_items
       WHERE invoice_id = ?`,
      [invoice.id]
    );

    // Detect any "extra" item columns beyond the default 4
    const extraColumns = [];
    if (items.length > 0) {
      const keys = Object.keys(items[0]);
      const defaultCols = ['desc', 'qty', 'rate', 'amt'];
      keys.forEach(k => {
        if (!defaultCols.includes(k)) extraColumns.push(k);
      });
    }

    // Get payment info
    const [payments] = await conn.execute(
      `SELECT 
        cash, check_payment AS \`check\`, check_no, bank, pay_date,
        vatable_sales, vat_exempt, zero_rated, vat_amount, less_vat, net_vat, withholding AS withholding_tax,
        total, due AS total_due, add_vat, payable AS total_payable, total_with_vat,
        prepared_by, approved_by, received_by
       FROM payments
       WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    const payment = payments[0] || {};

    // Merge invoice + payment + items into single object
    const result = {
      invoice_no: invoice.invoice_no,
      bill_to: invoice.bill_to,
      address1: invoice.address1,
      address2: invoice.address2,
      tin: invoice.tin,
      terms: invoice.terms,
      date: invoice.date,
      extra_columns: extraColumns,
      items,
      ...payment
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


