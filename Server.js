// ================== server.js ==================
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

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
    // Check if user exists
    const [rows] = await conn.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length > 0) return res.json({ success: false, message: "Username already exists" });

    // Insert new user
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
    const [payments] = await conn.execute('SELECT SUM(total) AS total FROM payments');
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

// --------------------- HELPERS: INVOICES ---------------------
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
    payment.payable || 0
  ];
  await conn.execute(sql, params);
}

async function insertFooter(conn, invoiceId, footer) {
  if (!footer) return;

  const sql = `
    INSERT INTO invoice_footer
      (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const params = [
    invoiceId,
    footer.atp_no || "",
    footer.atp_date || "",
    footer.bir_permit_no || "",
    footer.bir_date || "",
    footer.serial_nos || ""
  ];
  await conn.execute(sql, params);
}



// --------------------- INVOICE ROUTE ---------------------
app.post('/api/invoices', async (req, res) => {
  const invoiceData = req.body;

  if (!invoiceData.invoice_no || !invoiceData.bill_to || !invoiceData.date ||
      !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1️⃣ Insert main invoice
    const [invoiceResult] = await conn.execute(
      `INSERT INTO invoices
        (invoice_no, bill_to, address1, address2, tin, terms, date, total_amount_due, logo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceData.invoice_no,
        invoiceData.bill_to,
        invoiceData.address1,
        invoiceData.address2,
        invoiceData.tin,
        invoiceData.terms,
        invoiceData.date,
        invoiceData.total_amount_due,
        invoiceData.logo || null
      ]
    );
    const invoiceId = invoiceResult.insertId;

    // 2️⃣ Insert items
    for (const item of invoiceData.items) {
      await conn.execute(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, item.description, item.quantity, item.unit_price, item.amount]
      );
    }

    // 3️⃣ Insert payment
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

    // 4️⃣ Insert footer
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


// --------------------- GET INVOICE BY NUMBER ---------------------
// --------------------- GET INVOICE BY NUMBER ---------------------
app.get('/api/invoices/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    // Get invoice
    const [invoiceRows] = await conn.query(
      `SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1`,
      [invoiceNo]
    );
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    // Get items
    const [items] = await conn.query(
      `SELECT * FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );

    // Get payment
    const [paymentRows] = await conn.query(
      `SELECT * FROM payments WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    // Get footer
    const [footerRows] = await conn.query(
      `SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1`,
      [invoice.id]
    );

    // 🔹 Get company info
    const [companyRows] = await conn.query(`SELECT * FROM company_info LIMIT 1`);

    invoice.items = items;
    invoice.payment = paymentRows[0] || {};
    invoice.footer = footerRows[0] || {};
    invoice.company = companyRows[0] || {};   // <--- include company info

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

// DELETE invoice
app.delete('/api/invoices/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    const [invoiceRows] = await conn.query('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoiceId = invoiceRows[0].id;

    // Delete related items and payments first (foreign key constraints)
    await conn.query('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.query('DELETE FROM payments WHERE invoice_id = ?', [invoiceId]);

    // Delete invoice
    await conn.query('DELETE FROM invoices WHERE id = ?', [invoiceId]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});
app.get('/api/invoices/edit/:invoiceNo', async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await pool.getConnection();
  try {
    const [invoiceRows] = await conn.query('SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoiceRows[0];

    const [items] = await conn.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
    const [paymentRows] = await conn.query('SELECT * FROM payments WHERE invoice_id = ? LIMIT 1', [invoice.id]);

    res.json({ ...invoice, items, payment: paymentRows[0] || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

app.post('/api/invoices/bulk-delete', async (req, res) => {
  const { invoices } = req.body;
  if (!Array.isArray(invoices) || !invoices.length) return res.status(400).json({ error: 'No invoices selected' });

  const conn = await pool.getConnection();
  try {
    await conn.query(`DELETE FROM invoices WHERE invoice_no IN (?)`, [invoices]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Bulk delete error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});



// --------------------- START SERVER ---------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
