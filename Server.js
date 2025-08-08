require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/PRINTABLE', express.static(path.join(__dirname, 'PRINTABLE')));
app.use(bodyParser.json());

// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL DB');
});

// Save Invoice API
app.post('/invoice', (req, res) => {
  const data = req.body;
  const { invoiceNo, billTo, address1, address2, tin, terms, date, totalAmountDue } = data;

  // Insert into invoices table
  const invoiceQuery = `INSERT INTO invoices (invoice_no, bill_to, address1, address2, tin, terms, date, total_amount_due) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(invoiceQuery, [invoiceNo, billTo, address1, address2, tin, terms, date, totalAmountDue], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error saving invoice', details: err });

    const invoiceId = result.insertId;

    // Insert items if any
    if (data.desc && data.desc.length) {
      const itemValues = data.desc.map((desc, index) => [
        invoiceId,
        desc,
        data.qty[index] || 0,
        data.rate[index] || 0,
        data.amt[index] || 0
      ]);

      const itemQuery = `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES ?`;

      db.query(itemQuery, [itemValues], (itemErr) => {
        if (itemErr) return res.status(500).json({ error: 'Items insert failed', details: itemErr });
        res.json({ message: '✅ Invoice saved with items', invoiceId });
      });
    } else {
      res.json({ message: '✅ Invoice saved (no items)', invoiceId });
    }
  });
});

// GET all invoices
app.get('/invoices', (req, res) => {
  const query = `
    SELECT 
      invoice_no AS invoice_number,
      date AS invoice_date,
      bill_to,
      total_amount_due AS total_amount
    FROM invoices
    ORDER BY date DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching invoices:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});


app.delete('/invoice/:invoice_no', (req, res) => {
  const invoiceNo = req.params.invoice_no;
  const findInvoiceIdQuery = 'SELECT id FROM invoices WHERE invoice_no = ?';

  db.query(findInvoiceIdQuery, [invoiceNo], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoiceId = results[0].id;

    // Delete items first (foreign key with ON DELETE CASCADE helps, but just in case)
    const deleteItems = 'DELETE FROM invoice_items WHERE invoice_id = ?';
    db.query(deleteItems, [invoiceId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to delete items' });

      const deleteInvoice = 'DELETE FROM invoices WHERE id = ?';
      db.query(deleteInvoice, [invoiceId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete invoice' });
        res.sendStatus(200);
      });
    });
  });
});


// Get single invoice by invoice_no
app.get('/invoice/:invoice_no', (req, res) => {
  const invoiceNo = req.params.invoice_no;

  // Get invoice header
  const invoiceQuery = `
    SELECT 
      id,
      invoice_no AS invoice_number,
      bill_to,
      address1,
      address2,
      tin,
      terms,
      date AS invoice_date,
      total_amount_due AS total_amount
    FROM invoices
    WHERE invoice_no = ?
  `;

  db.query(invoiceQuery, [invoiceNo], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = results[0];
    const invoiceId = invoice.id;

    // Get items associated with this invoice
    const itemsQuery = `
      SELECT 
        description,
        quantity,
        unit_price,
        amount
      FROM invoice_items
      WHERE invoice_id = ?
    `;

    db.query(itemsQuery, [invoiceId], (itemErr, items) => {
      if (itemErr) {
        return res.status(500).json({ error: 'Failed to fetch items' });
      }

      // Add items to invoice object
      invoice.items = items;
      res.json(invoice);
    });
  });
});



app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
