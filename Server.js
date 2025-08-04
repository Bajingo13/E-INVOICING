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

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
