// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --------------------- MYSQL POOL ---------------------
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'BSU2025!@',
  database: 'invoice_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --------------------- LOGO UPLOAD ---------------------
const uploadFolder = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const invoiceNo = req.body.invoice_no || Date.now();
    cb(null, `${invoiceNo}${ext}`);
  }
});

const upload = multer({ storage });

app.post('/upload-logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const relativePath = `/uploads/${req.file.filename}`;
  res.json({ filename: relativePath });
});

// --------------------- INSERT HELPERS ---------------------
async function insertInvoice(conn, invoice) {
  const sql = `
    INSERT INTO invoices
      (invoice_no, bill_to, address1, address2, tin, terms, date, total_amount_due, logo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    invoice.logo || null
  ];
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

async function insertItems(conn, invoiceId, items) {
  if (!Array.isArray(items)) return;

  const [cols] = await conn.execute(`SHOW COLUMNS FROM invoice_items`);
  const existingCols = cols.map(c => c.Field);

  for (const item of items) {
    let columns = ["invoice_id", "description", "quantity", "unit_price", "amount"];
    let values = [invoiceId, item.description, item.quantity, item.unit_price, item.amount];
    let placeholders = ["?", "?", "?", "?", "?"];

    for (const [key, val] of Object.entries(item)) {
      if (["description", "quantity", "unit_price", "amount"].includes(key)) continue;

      if (!existingCols.includes(key)) {
        await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${key}\` VARCHAR(255)`);
        existingCols.push(key);
      }

      columns.push("`" + key + "`");
      values.push(val);
      placeholders.push("?");
    }

    const sql = `INSERT INTO invoice_items (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;
    await conn.execute(sql, values);
  }
}

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

// --------------------- ROUTES ---------------------
// POST /api/invoices
app.post('/api/invoices', async (req, res) => {
  const invoiceData = req.body;

  if (!invoiceData.invoice_no || !invoiceData.bill_to || !invoiceData.date ||
      !invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
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

// GET /invoice-no/:invoiceNo
app.get('/invoice-no/:invoiceNo', async (req, res) => {
  const { invoiceNo } = req.params;
  const conn = await pool.getConnection();

  try {
    const [invoiceRows] = await conn.execute(
      `SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1`,
      [invoiceNo]
    );
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    const [itemCols] = await conn.execute(`SHOW COLUMNS FROM invoice_items`);
    const itemFields = itemCols.map(c => c.Field).filter(c => c !== "id" && c !== "invoice_id");

    const [items] = await conn.execute(
      `SELECT ${itemFields.map(f => `\`${f}\``).join(", ")} FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );

    const activeColumns = itemFields.filter(col => items.some(item => item[col] !== null && item[col] !== ''));
    const filteredItems = items.map(item => {
      const obj = {};
      activeColumns.forEach(col => obj[col] = item[col]);
      return obj;
    });

    const [payments] = await conn.execute(
      `SELECT 
         cash,
         check_payment AS \`check\`,
         check_no,
         bank,
         pay_date,
         vatable_sales,
         total_sales,
         vat_exempt,
         less_vat,
         zero_rated,
         net_vat,
         vat_amount,
         withholding AS withholding_tax,
         total,
         due AS total_due,
         payable AS total_payable
       FROM payments
       WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    const payment = payments[0] || {};

    res.json({
      invoice_no: invoice.invoice_no,
      bill_to: invoice.bill_to,
      address1: invoice.address1,
      address2: invoice.address2,
      tin: invoice.tin,
      terms: invoice.terms,
      date: invoice.date,
      items: filteredItems,
      payment,
      logo: invoice.logo || null
    });

  } catch (error) {
    console.error('Error fetching invoice:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// --------------------- START SERVER ---------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
