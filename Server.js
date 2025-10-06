// ================== server.js ==================
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const eis = require("./middleware/eis");

 
const app = express();
app.use(express.json());

// --------------------- HTML ROUTES ---------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Dashboard.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/company-setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'company_info.html')));
app.get('/invoice-list', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'invoice-list.html'));
});

// --------------------- STATIC ASSETS ---------------------
app.use(express.static(path.join(__dirname, 'public')));

// --------------------- MYSQL POOL ---------------------
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Bsu2025!@',
  database: 'invoice_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --------------------- LOGO UPLOAD FOR INVOICES ---------------------
const invoiceLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const invoiceNo = req.body.invoice_no || Date.now();
      cb(null, `invoice_${invoiceNo}${ext}`);
    }
  })
});

app.post('/upload-logo', invoiceLogoUpload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const filePath = `/uploads/${req.file.filename}`;
    res.json({ filename: filePath, message: "✅ Logo uploaded successfully!" });
  } catch (err) {
    console.error("Logo upload error:", err);
    res.status(500).json({ error: "❌ Error uploading logo" });
  }
});

// --------------------- LOGIN ROUTE ---------------------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) 
    return res.json({ success: false, message: "Username and password required" });

  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        'SELECT * FROM users WHERE username = ? AND password = ?', 
        [username, password]
      );

      if (rows.length > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false, message: "Invalid username or password" });
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --------------------- CREATE ACCOUNT ---------------------
app.post('/api/create-account', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.json({ success: false, message: "Username and password required" });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length > 0) return res.json({ success: false, message: "Username already exists" });

    await conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// --------------------- DASHBOARD API ---------------------
app.get('/api/dashboard', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [invoices] = await conn.execute('SELECT COUNT(*) AS total FROM invoices');
    const [payments] = await conn.execute('SELECT SUM(total_amount_due) AS total FROM invoices');
    const [pending] = await conn.execute('SELECT COUNT(*) AS total FROM invoices WHERE total_amount_due > 0');

    res.json({
      totalInvoices: invoices[0].total,
      totalPayments: payments[0].total || 0,
      pendingInvoices: pending[0].total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({});
  } finally {
    conn.release();
  }
});

// --------------------- COMPANY INFO ROUTES ---------------------
const companyUpload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `company_logo${ext}`);
    }
  })
});

app.post('/save-company-info', companyUpload.single('logo'), async (req, res) => {
  try {
    const { company_name, company_address, tel_no, vat_tin } = req.body;
    const logo_path = req.file ? `/uploads/${req.file.filename}` : null;

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(`SELECT * FROM company_info LIMIT 1`);
      if (rows.length > 0) {
        await conn.execute(
          `UPDATE company_info SET company_name=?, company_address=?, tel_no=?, vat_tin=?, logo_path=? WHERE company_id=?`,
          [company_name, company_address, tel_no, vat_tin, logo_path || rows[0].logo_path, rows[0].company_id]
        );
      } else {
        await conn.execute(
          `INSERT INTO company_info (company_name, company_address, tel_no, vat_tin, logo_path)
           VALUES (?, ?, ?, ?, ?)`,
          [company_name, company_address, tel_no, vat_tin, logo_path]
        );
      }
      res.json({ message: "✅ Company info saved successfully!" });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "❌ Error saving company info" });
  }
});

app.get('/get-company-info', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(`SELECT * FROM company_info LIMIT 1`);
      res.json(rows[0] || {});
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "❌ Error fetching company info" });
  }
});

// --------------------- CREATE INVOICE ---------------------
app.post('/api/invoices', async (req, res) => {
  const invoiceData = req.body;

  if (!invoiceData.invoice_no || !invoiceData.bill_to || !invoiceData.date ||
      !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  // Determine extra columns for this invoice (not the 4 defaults)
  const defaultItemCols = ["description", "quantity", "unit_price", "amount"];
  let extraColumns = [];
  invoiceData.items.forEach(item => {
    Object.keys(item).forEach(key => {
      if (!defaultItemCols.includes(key) && !extraColumns.includes(key)) {
        extraColumns.push(key);
      }
    });
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [invoiceResult] = await conn.execute(
      `INSERT INTO invoices
  (invoice_no, invoice_type, bill_to, address1, address2, tin, terms, date, total_amount_due, logo, extra_columns)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      [
        invoiceData.invoice_no,
        invoiceData.invoice_type,
        invoiceData.bill_to,
        invoiceData.address1,
        invoiceData.address2,
        invoiceData.tin,
        invoiceData.terms,
        invoiceData.date,
        invoiceData.total_amount_due,
        invoiceData.logo || null,
        JSON.stringify(extraColumns)
      ]
    );
    const invoiceId = invoiceResult.insertId;

    for (const item of invoiceData.items) {
      const [cols] = await conn.execute(`SHOW COLUMNS FROM invoice_items`);
      const existingCols = cols.map(c => c.Field);

      const columns = ["invoice_id", "description", "quantity", "unit_price", "amount"];
      const values = [invoiceId, item.description, item.quantity, item.unit_price, item.amount];
      const placeholders = ["?", "?", "?", "?", "?"];

      for (const [key, val] of Object.entries(item)) {
        if (["description","quantity","unit_price","amount"].includes(key)) continue;
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

    if (invoiceData.payment) {
      const p = invoiceData.payment;
      await conn.execute(
        `INSERT INTO payments
          (invoice_id, cash, check_payment, check_no, bank, vatable_sales, total_sales,
           vat_exempt, less_vat, zero_rated, net_vat, vat_amount, withholding, total,
           due, pay_date, payable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          p.cash || false,
          p.check_payment || false,
          p.check_no || null,
          p.bank || null,
          p.vatable_sales || 0,
          p.total_sales || 0,
          p.vat_exempt || 0,
          p.less_vat || 0,
          p.zero_rated || 0,
          p.net_vat || 0,
          p.vat_amount || 0,
          p.withholding || 0,
          p.total || 0,
          p.due || 0,
          p.pay_date || null,
          p.payable || 0
        ]
      );
    }

    if (invoiceData.footer) {
      const f = invoiceData.footer;
      await conn.execute(
        `INSERT INTO invoice_footer 
          (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no, f.atp_date, f.bir_permit_no, f.bir_date, f.serial_nos]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, invoiceId });
  } catch (err) {
    await conn.rollback();
    console.error('❌ Database transaction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// --------------------- UPDATE INVOICE ---------------------
app.put('/api/invoices/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const invoiceData = req.body;

  // Determine extra columns for this invoice (not the 4 defaults)
  const defaultItemCols = ["description", "quantity", "unit_price", "amount"];
  let extraColumns = [];
  invoiceData.items.forEach(item => {
    Object.keys(item).forEach(key => {
      if (!defaultItemCols.includes(key) && !extraColumns.includes(key)) {
        extraColumns.push(key);
      }
    });
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [invoiceRows] = await conn.query(
      `SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1`,
      [invoiceNo]
    );
    if (invoiceRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoiceId = invoiceRows[0].id;

    await conn.execute(
      `UPDATE invoices
       SET bill_to=?, address1=?, address2=?, tin=?, terms=?, date=?, total_amount_due=?, logo=?, extra_columns=?
       WHERE id=?`,
      [
        invoiceData.bill_to,
        invoiceData.address1,
        invoiceData.address2,
        invoiceData.tin,
        invoiceData.terms,
        invoiceData.date,
        invoiceData.total_amount_due,
        invoiceData.logo || null,
        JSON.stringify(extraColumns),
        invoiceId
      ]
    );

    await conn.execute(`DELETE FROM invoice_items WHERE invoice_id=?`, [invoiceId]);
    for (const item of invoiceData.items) {
      const [cols] = await conn.execute(`SHOW COLUMNS FROM invoice_items`);
      const existingCols = cols.map(c => c.Field);

      const columns = ["invoice_id", "description", "quantity", "unit_price", "amount"];
      const values = [invoiceId, item.description, item.quantity, item.unit_price, item.amount];
      const placeholders = ["?", "?", "?", "?", "?"];

      for (const [key, val] of Object.entries(item)) {
        if (["description","quantity","unit_price","amount"].includes(key)) continue;
        if (!existingCols.includes(key)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${key}\` VARCHAR(255)`);
          existingCols.push(key);
        }
        columns.push("`" + key + "`");
        values.push(val);
        placeholders.push("?");
      }

      await conn.execute(
        `INSERT INTO invoice_items (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values
      );
    }

    await conn.execute(`DELETE FROM payments WHERE invoice_id=?`, [invoiceId]);
    if (invoiceData.payment) {
      const p = invoiceData.payment;
      await conn.execute(
        `INSERT INTO payments
          (invoice_id, cash, check_payment, check_no, bank, vatable_sales, total_sales,
           vat_exempt, less_vat, zero_rated, net_vat, vat_amount, withholding, total,
           due, pay_date, payable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          p.cash || false,
          p.check_payment || false,
          p.check_no || null,
          p.bank || null,
          p.vatable_sales || 0,
          p.total_sales || 0,
          p.vat_exempt || 0,
          p.less_vat || 0,
          p.zero_rated || 0,
          p.net_vat || 0,
          p.vat_amount || 0,
          p.withholding || 0,
          p.total || 0,
          p.due || 0,
          p.pay_date || null,
          p.payable || 0
        ]
      );
    }

    await conn.execute(`DELETE FROM invoice_footer WHERE invoice_id=?`, [invoiceId]);
    if (invoiceData.footer) {
      const f = invoiceData.footer;
      await conn.execute(
        `INSERT INTO invoice_footer 
          (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no, f.atp_date, f.bir_permit_no, f.bir_date, f.serial_nos]
      );
    }

    await conn.commit();
    res.json({ success: true, invoiceId });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Update invoice error:", err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// --------------------- GET INVOICE BY NUMBER ---------------------
app.get('/api/invoices/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    const [invoiceRows] = await conn.query(
      `SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1`,
      [invoiceNo]
    );
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    const [columns] = await conn.query(`SHOW COLUMNS FROM invoice_items`);
    const colNames = columns.map(c => c.Field);

    const [items] = await conn.query(
      `SELECT ${colNames.map(c => '`'+c+'`').join(', ')} FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );

    const [paymentRows] = await conn.query(
      `SELECT * FROM payments WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    const [footerRows] = await conn.query(
      `SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    const [companyRows] = await conn.query(`SELECT * FROM company_info LIMIT 1`);

    // Parse extra_columns JSON
    let extra_columns = [];
    try {
      extra_columns = invoice.extra_columns ? JSON.parse(invoice.extra_columns) : [];
    } catch (e) {}

    invoice.items = items;
    invoice.payment = paymentRows[0] || {};
    invoice.footer = footerRows[0] || {};
    invoice.company = companyRows[0] || {};
    invoice.extra_columns = extra_columns; // <-- Attach to response

    res.json(invoice);
  } catch (err) {
    console.error('❌ Error fetching invoice:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// --------------------- GET ALL INVOICES ---------------------
app.get('/api/invoices', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT i.id, i.invoice_no, i.bill_to, i.date AS invoice_date, 
              i.total_amount_due, i.logo
       FROM invoices i
       ORDER BY i.date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching all invoices:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    conn.release();
  }
});

// --------------------- DELETE INVOICE ---------------------
app.delete('/api/invoices/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    const [invoiceRows] = await conn.query('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoiceId = invoiceRows[0].id;

    await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.query('DELETE FROM payments WHERE invoice_id = ?', [invoiceId]);
    await conn.query('DELETE FROM invoice_footer WHERE invoice_id = ?', [invoiceId]);
    await conn.query('DELETE FROM invoices WHERE id = ?', [invoiceId]);

    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error("❌ Error deleting invoice:", err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// --------------------- EIS INTEGRATION ROUTES ---------------------
app.post('/api/send-invoice/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`SELECT * FROM invoices WHERE invoice_no=? LIMIT 1`, [invoiceNo]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = rows[0];
    // You might also need to fetch items, payment, footer like in your GET invoice API
    const result = await eis.sendInvoiceToEIS(invoice);

    res.json({ success: true, response: result });
  } catch (err) {
    console.error("❌ Send to EIS failed:", err.message);
    res.status(500).json({ error: "Failed to send invoice to EIS" });
  } finally {
    conn.release();
  }
});

// Check status route
app.get('/api/check-status/:submissionId', async (req, res) => {
  try {
    const submissionId = req.params.submissionId;
    const status = await eis.checkInvoiceStatus(submissionId);
    res.json({ success: true, status });
  } catch (err) {
    console.error("❌ Check status failed:", err.message);
    res.status(500).json({ error: "Failed to check status" });
  }
});



// --------------------- START SERVER ---------------------
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));