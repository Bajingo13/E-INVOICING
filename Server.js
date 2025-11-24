// ================== Server.js (Full Ready-to-Run) ==================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cron = require('node-cron');
const morgan = require('morgan');
const bcrypt = require('bcrypt');
//const eis = require('./middleware/eis');

const app = express();
app.use(express.json());

// ----------------- Session Management -----------------
const session = require('express-session');

app.use(session({
  secret: process.env.SESSION_SECRET,  
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000,   
    secure: process.env.NODE_ENV === 'production',  
    httpOnly: true,           
    sameSite: 'lax'           
  },
  rolling: true             
}));


// ----------------- Configuration & Debug -----------------
const DEBUG = process.env.DEBUG === 'true' || false;
const PORT = process.env.PORT || 3000;
function debugLog(...args) { if (DEBUG) console.debug('[DEBUG]', ...args); }
function infoLog(...args) { console.log('[INFO]', ...args); }
function errorLog(...args) { console.error('[ERROR]', ...args); }

// ----------------- HTTP Request Logger -----------------
app.use(morgan('dev'));

// ----------------- MySQL Pool -----------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  timezone: '+08:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
});
async function getConn() { try { return await pool.getConnection(); } catch (err) { errorLog('DB Connection Error:', err); throw err; } }


// ----------------- Helpers -----------------
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function safeJSONParse(str, fallback = []) { try { return JSON.parse(str); } catch { return fallback; } }
function parseDecimal(v) { if (v === undefined || v === null || v === '' || isNaN(v)) return 0; return parseFloat(v); }

async function generateInvoiceNo(conn) {
  await conn.beginTransaction(); // start transaction
  try {
    
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
    if (!rows.length) throw new Error('Invoice counter not initialized');

    const counter = rows[0];
    const nextNumber = counter.last_number + 1;
    const invoiceNo = `${counter.prefix}-${String(nextNumber).padStart(6, '0')}`;

    await conn.execute('UPDATE invoice_counter SET last_number = ? WHERE id = ?', [nextNumber, counter.id]);
    await conn.commit(); 

    return invoiceNo;
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}


// ----------------- Static Routes -----------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Dashboard.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice.html')));
app.get('/company-setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'company_info.html')));
app.get('/invoice-list', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice-list.html')));


// ----------------- Routes: Auth -----------------
const authRoutes = require('./route/auth.js');
app.use('/auth', authRoutes);

// ----------------- Routes: COA -----------------
const coaRoutes = require('./route/COA.js');
app.use('/api/coa', coaRoutes);

// ----------------- Routes: Import -----------------
const importRoutes = require('./route/import');
app.use('/api/import', importRoutes);


// ----------------- Routes: Next Invoice Number -----------------
app.get('/api/next-invoice-no', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.query('SELECT * FROM invoice_counter LIMIT 1');
    if (!rows.length) return res.status(500).json({ error: 'Invoice counter not initialized' });

    const counter = rows[0];
    const nextNumber = counter.last_number + 1;
    const invoiceNo = `${counter.prefix}-${String(nextNumber).padStart(6, '0')}`;

    res.json({ invoiceNo });
  } finally {
    conn.release();
  }
}));


// ----------------- Multer Upload -----------------
function ensureUploadFolder() { const folder = path.join(__dirname, 'public', 'uploads'); if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true }); return folder; }
function createStorage(filenameResolver) { return multer.diskStorage({ destination: (req, file, cb) => cb(null, ensureUploadFolder()), filename: (req, file, cb) => cb(null, filenameResolver(req, file)) }); }
const invoiceLogoUpload = multer({ storage: createStorage((req, file) => `invoice_${req.body.invoice_no || Date.now()}${path.extname(file.originalname)}`) });
const companyUpload = multer({ storage: createStorage((req, file) => `company_logo${path.extname(file.originalname)}`) });

// ----------------- Recurring Invoice Helpers -----------------
function isInvoiceDue(r) { const now = new Date(); const last = r.last_generated ? new Date(r.last_generated) : new Date(r.recurrence_start_date); return Math.floor((now - last) / (1000 * 60 * 60 * 24)) >= 1; }


// ----------------- Schedule Recurring Job -----------------
async function scheduleRecurringJob() {
  cron.schedule('0 0 * * *', async () => {
    infoLog('Running recurring invoice check at', new Date().toLocaleString());
    const conn = await getConn();
    try {
      const [recurringList] = await conn.execute(`
        SELECT * FROM invoices
        WHERE recurrence_status='active' AND recurrence_type IS NOT NULL AND recurrence_start_date <= CURDATE() AND recurrence_end_date >= CURDATE()
      `);
      infoLog(`Found ${recurringList.length} active recurring invoice(s)`);
      for (const r of recurringList) if (isInvoiceDue(r)) await generateInvoiceFromRecurring(conn, r);
      await conn.execute(`UPDATE invoices SET recurrence_status='ended' WHERE recurrence_end_date < CURDATE()`);
    } catch (err) { errorLog('Recurring job error:', err); } finally { conn.release(); }
  }, { scheduled: true });
}

// POST /api/users

app.post('/api/users', asyncHandler(async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing required fields' });

  const hashedPassword = await bcrypt.hash(password, 10);

  const conn = await getConn();
  try {
    await conn.execute('INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, NOW())', [username, hashedPassword, role]);
    res.json({ message: 'User created successfully' });
  } finally { conn.release(); }
}));


// ----------------- Routes: Upload -----------------
app.post('/upload-logo', invoiceLogoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: `/uploads/${req.file.filename}`, message: 'Logo uploaded successfully' });
});

// ----------------- Routes: Dashboard -----------------
app.get('/api/dashboard', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [invoices] = await conn.execute('SELECT COUNT(*) AS total FROM invoices');
    const [totalAmountDue] = await conn.execute('SELECT SUM(total_amount_due) AS total FROM invoices');
    const [pending] = await conn.execute('SELECT COUNT(*) AS total FROM invoices WHERE status = "pending"');
    res.json({ totalInvoices: invoices[0].total, totalPayments: totalAmountDue[0].total || 0, pendingInvoices: pending[0].total });
  } finally { conn.release(); }
}));

// ----------------- Routes: Company Info -----------------
app.post('/save-company-info', companyUpload.single('logo'), asyncHandler(async (req, res) => {
  const { company_name, company_address, tel_no, vat_tin } = req.body;
  const logo_path = req.file ? `/uploads/${req.file.filename}` : null;
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    if (rows.length > 0) {
      await conn.execute(
        `UPDATE company_info SET company_name=?, company_address=?, tel_no=?, vat_tin=?, logo_path=? WHERE company_id=?`,
        [company_name, company_address, tel_no, vat_tin, logo_path || rows[0].logo_path, rows[0].company_id]
      );
    } else {
      await conn.execute(
        `INSERT INTO company_info (company_name, company_address, tel_no, vat_tin, logo_path) VALUES (?, ?, ?, ?, ?)`,
        [company_name, company_address, tel_no, vat_tin, logo_path]
      );
    }
    res.json({ message: 'Company info saved successfully' });
  } finally { conn.release(); }
}));
app.get('/get-company-info', asyncHandler(async (req, res) => { const conn = await getConn(); try { const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1'); res.json(rows[0] || {}); } finally { conn.release(); } }));



// ----------------- Routes: Invoice CRUD (Create, Update, Get, List, Delete) -----------------

// ----------------- Helper: Generate recurring invoice safely -----------------
async function generateInvoiceFromRecurring(conn, recurring) {
  debugLog('Generating recurring invoice for', recurring.bill_to);

  // Start transaction for safety
  await conn.beginTransaction();
  try {
    // Generate consistent invoice number
    const invoiceNo = await generateInvoiceNo(conn);

    const [result] = await conn.execute(`
      INSERT INTO invoices
      (invoice_no, bill_to, address1, total_amount_due, recurrence_type, terms, date, due_date, recurrence_status)
      VALUES (?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'active')
    `, [invoiceNo, recurring.bill_to, recurring.address1, recurring.total_amount_due, recurring.recurrence_type, recurring.terms]);

    const newInvoiceId = result.insertId;

    // Mark last generated date
    await conn.execute('UPDATE invoices SET last_generated = CURDATE() WHERE id = ?', [recurring.id]);

    await conn.commit();
    infoLog(`Generated recurring invoice ${invoiceNo} for ${recurring.bill_to}`);
    return invoiceNo;
  } catch (err) {
    await conn.rollback();
    errorLog('Error generating recurring invoice:', err);
    throw err;
  }
}


// ----------------- POST /api/invoices -----------------
app.post('/api/invoices', asyncHandler(async (req, res) => {
  const invoiceData = req.body;

  if (!invoiceData.bill_to || !invoiceData.date ||
      !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  const conn = await getConn();
  try {
    await conn.beginTransaction();

    // Generate invoice number safely
    const invoiceNo = await generateInvoiceNo(conn);
    invoiceData.invoice_no = invoiceNo;

    const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount'];
    let extraColumns = [];
    invoiceData.items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!defaultItemCols.includes(key) && !extraColumns.includes(key)) extraColumns.push(key);
      });
    });

    
    const invoiceStatus = invoiceData.status || 'draft'; 

const [invoiceResult] = await conn.execute(
  `INSERT INTO invoices
    (invoice_no, invoice_type, bill_to, address1, address2, tin, terms, date, due_date, total_amount_due, logo, extra_columns,
     recurrence_type, recurrence_start_date, recurrence_end_date, recurrence_status, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
  [
    invoiceData.invoice_no,
    invoiceData.invoice_type,
    invoiceData.bill_to,
    invoiceData.address1,
    invoiceData.address2,
    invoiceData.tin,
    invoiceData.terms,
    invoiceData.date,
    invoiceData.due_date || null,
    invoiceData.logo || null,
    JSON.stringify(extraColumns || []),
    invoiceData.recurrence_type || null,
    invoiceData.recurrence_start_date || null,
    invoiceData.recurrence_end_date || null,
    invoiceData.recurrence_type ? 'active' : null,
    invoiceStatus
  ]
);


    const invoiceId = invoiceResult.insertId;

    // ------------------ Insert items and calculate total_amount_due ------------------
    let totalAmountDue = 0;
    for (const item of invoiceData.items) {
      const [cols] = await conn.execute('SHOW COLUMNS FROM invoice_items');
      const existingCols = cols.map(c => c.Field);

      const columns = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount'];
      let quantity = parseDecimal(item.quantity);
      let unit_price = parseDecimal(item.unit_price);

      // Base item amount
      let itemAmount = quantity * unit_price;

      // Extra numeric columns
      const extraCols = Object.keys(item).filter(k => !defaultItemCols.includes(k));
      for (const key of extraCols) {
        const val = parseDecimal(item[key]);
        if (!isNaN(val)) itemAmount += val;

        // Add extra column to table if missing
        if (!existingCols.includes(key)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${key}\` VARCHAR(255)`);
          existingCols.push(key);
        }
        columns.push('`' + key + '`');
      }

      const values = [invoiceId, item.description || '', quantity, unit_price, itemAmount];
      const placeholders = ['?', '?', '?', '?', '?'];

      // Add extra column values
      for (const key of extraCols) {
        values.push(item[key] || null);
        placeholders.push('?');
      }

      await conn.execute(`INSERT INTO invoice_items (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);

      // Add to invoice total
      totalAmountDue += itemAmount;
    }

    // ------------------ Update invoice total_amount_due ------------------
    await conn.execute('UPDATE invoices SET total_amount_due=? WHERE id=?', [totalAmountDue, invoiceId]);

    // ------------------ Insert payment if exists ------------------
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

    // ------------------ Insert footer if exists ------------------
    if (invoiceData.footer) {
      const f = invoiceData.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no, f.atp_date, f.bir_permit_no, f.bir_date, f.serial_nos]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, invoiceId, invoiceNo, total_amount_due: totalAmountDue });
  } catch (err) {
    await conn.rollback();
    errorLog('Create invoice transaction error:', err);
    throw err;
  } finally {
    conn.release();
  }
}));



// ----------------- UPDATE /api/invoices/:invoiceNo -----------------
app.put('/api/invoices/:invoiceNo', asyncHandler(async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const invoiceData = req.body;

  if (!invoiceData.bill_to || !invoiceData.date ||
      !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  const conn = await getConn();
  try {
    await conn.beginTransaction();

    // Get invoice id
    const [invoiceRows] = await conn.execute('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoiceId = invoiceRows[0].id;

    const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount'];
    let extraColumns = [];
    invoiceData.items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!defaultItemCols.includes(key) && !extraColumns.includes(key)) extraColumns.push(key);
      });
    });

    // ------------------ Delete old items ------------------
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [invoiceId]);

    // ------------------ Insert new items and calculate total_amount_due ------------------
    let totalAmountDue = 0;
    for (const item of invoiceData.items) {
      const [cols] = await conn.execute('SHOW COLUMNS FROM invoice_items');
      const existingCols = cols.map(c => c.Field);

      const columns = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount'];
      let quantity = parseDecimal(item.quantity);
      let unit_price = parseDecimal(item.unit_price);

      // Base item amount
      let itemAmount = quantity * unit_price;

      // Extra numeric columns
      const extraCols = Object.keys(item).filter(k => !defaultItemCols.includes(k));
      for (const key of extraCols) {
        const val = parseDecimal(item[key]);
        if (!isNaN(val)) itemAmount += val;

        // Add extra column to table if missing
        if (!existingCols.includes(key)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${key}\` VARCHAR(255)`);
          existingCols.push(key);
        }
        columns.push('`' + key + '`');
      }

      const values = [invoiceId, item.description || '', quantity, unit_price, itemAmount];
      const placeholders = ['?', '?', '?', '?', '?'];

      // Add extra column values
      for (const key of extraCols) {
        values.push(item[key] || null);
        placeholders.push('?');
      }

      await conn.execute(`INSERT INTO invoice_items (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);

      totalAmountDue += itemAmount;
    }

    // ------------------ Update invoice ------------------
    await conn.execute(
  `UPDATE invoices SET invoice_type=?, bill_to=?, address1=?, address2=?, tin=?, terms=?, date=?, total_amount_due=?, logo=?, extra_columns=?, status=? WHERE id=?`,
  [
    invoiceData.invoice_type,
    invoiceData.bill_to,
    invoiceData.address1,
    invoiceData.address2,
    invoiceData.tin,
    invoiceData.terms,
    invoiceData.date,
    totalAmountDue,
    invoiceData.logo || null,
    JSON.stringify(extraColumns),
    invoiceData.status || 'draft', // ← default to draft
    invoiceId
  ]
);


    // ------------------ Delete and insert payment ------------------
    await conn.execute('DELETE FROM payments WHERE invoice_id=?', [invoiceId]);
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

    // ------------------ Delete and insert footer ------------------
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [invoiceId]);
    if (invoiceData.footer) {
      const f = invoiceData.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no, f.atp_date, f.bir_permit_no, f.bir_date, f.serial_nos]
      );
    }

    await conn.commit();
    res.json({ success: true, invoiceId, total_amount_due: totalAmountDue });
  } catch (err) {
    await conn.rollback();
    errorLog('Update invoice error:', err);
    throw err;
  } finally {
    conn.release();
  }
}));


// ----------------- GET /api/invoices/:invoiceNo -----------------
app.get('/api/invoices/:invoiceNo', asyncHandler(async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    const [invoiceRows] = await conn.execute('SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    const [columns] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const colNames = columns.map(c => c.Field);

    const [items] = await conn.execute(`SELECT ${colNames.map(c => '`' + c + '`').join(', ')} FROM invoice_items WHERE invoice_id = ?`, [invoice.id]);
    const [paymentRows] = await conn.execute('SELECT * FROM payments WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [footerRows] = await conn.execute('SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [companyRows] = await conn.execute('SELECT * FROM company_info LIMIT 1');

    invoice.items = items;
    invoice.payment = paymentRows[0] || {};
    invoice.footer = footerRows[0] || {};
    invoice.company = companyRows[0] || {};
    invoice.extra_columns = safeJSONParse(invoice.extra_columns, []);

    res.json(invoice);
  } finally {
    conn.release();
  }
}));

app.get('/api/invoices', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    // Optional query parameter: ?status=pending
    const { status } = req.query;
    let query = `
      SELECT i.id, i.invoice_no, i.bill_to, i.date AS invoice_date, i.total_amount_due, i.logo, i.status
      FROM invoices i
    `;
    const params = [];

    if (status) {
      query += ' WHERE i.status = ?';
      params.push(status);
    }

    query += ' ORDER BY i.date DESC';

    const [rows] = await conn.execute(query, params);
    res.json(rows);
  } finally {
    conn.release();
  }
}));


app.delete('/api/invoices/:invoiceNo', asyncHandler(async (req, res) => {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    const [invoiceRows] = await conn.execute('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoiceId = invoiceRows[0].id;
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM payments WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoices WHERE id = ?', [invoiceId]);
    res.json({ success: true, message: 'Invoice deleted successfully' });
  } finally {
    conn.release();
  }
}));

// GET /api/users
app.get('/api/users', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id, username, role, created_at FROM users');
    res.json(rows);
  } finally { conn.release(); }
}));


// GET /api/login-history
app.get('/api/login-history', async (req, res) => {
  try {
    const conn = await getConn();
    const [rows] = await conn.execute(
      `SELECT lh.*, u.username AS real_username
       FROM login_history lh
       LEFT JOIN users u ON lh.user_id = u.id
       ORDER BY lh.timestamp DESC`
    );
    conn.release();
    res.json(rows);
  } catch (err) {
    console.error("Login history error:", err);
    res.status(500).json({ error: "Failed to load login history" });
  }
});





// ----------------- Global Error Handler -----------------
app.use((err, req, res, next) => { errorLog('Unhandled error:', err); res.status(500).json({ error: 'Internal server error', message: err.message }); });

// ----------------- Process-level handlers -----------------
process.on('unhandledRejection', reason => errorLog('Unhandled Rejection:', reason));
process.on('uncaughtException', err => { errorLog('Uncaught Exception:', err); process.exit(1); });

// ----------------- Start server & cron -----------------
scheduleRecurringJob().catch(err => errorLog('Failed to schedule recurring job:', err));
app.listen(PORT, () => infoLog(`Server running at http://localhost:${PORT}`));
