// controllers/invoicesController.js
const { getConn } = require('../db/pool');
const { generateInvoiceNo } = require('../utils/invoiceCounter');

/**
 * createInvoice - expects JSON payload similar to your previous schema:
 * {
 *   bill_to, date, items: [ { description, quantity, unit_price, ...extra } ], payment?, footer?, recurrence...
 * }
 */
async function createInvoice(req, res) {
  const data = req.body;

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || data.items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();
  try {
    await conn.beginTransaction();

    // Generate invoice_no (transactionally safe)
    const invoiceNo = await generateInvoiceNo(conn);

    // Prepare invoice core insert
    const invoiceInsertSql = `INSERT INTO invoices
      (invoice_no, invoice_type, bill_to, address1, address2, tin, terms, date, due_date, total_amount_due, logo, extra_columns,
       recurrence_type, recurrence_start_date, recurrence_end_date, recurrence_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    // compute extra columns list
    const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount'];
    let extraColumnsSet = new Set();
    for (const it of data.items) {
      Object.keys(it || {}).forEach(k => {
        if (!defaultItemCols.includes(k)) extraColumnsSet.add(k);
      });
    }
    const extraColumns = Array.from(extraColumnsSet);

    const [invoiceResult] = await conn.execute(invoiceInsertSql, [
      invoiceNo,
      data.invoice_type || null,
      data.bill_to,
      data.address1 || null,
      data.address2 || null,
      data.tin || null,
      data.terms || null,
      data.date,
      data.due_date || null,
      0, // total_amount_due calculated after items
      data.logo || null,
      JSON.stringify(extraColumns),
      data.recurrence_type || null,
      data.recurrence_start_date || null,
      data.recurrence_end_date || null,
      data.recurrence_type ? 'active' : null,
      data.status || 'draft'
    ]);

    const invoiceId = invoiceResult.insertId;

    // Insert items; create missing invoice_items columns if needed
    // Fetch existing columns once
    const [colRows] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const existingCols = colRows.map(c => c.Field);

    let totalAmount = 0;
    for (const item of data.items) {
      const quantity = parseFloat(item.quantity) || 0;
      const unit_price = parseFloat(item.unit_price) || 0;
      let itemAmount = quantity * unit_price;

      const extraKeys = Object.keys(item).filter(k => !defaultItemCols.includes(k));
      // Add extra numeric values to itemAmount if numeric
      for (const k of extraKeys) {
        const val = parseFloat(item[k]);
        if (!Number.isNaN(val)) itemAmount += val;
        // ensure column exists (store as VARCHAR - flexibility)
        if (!existingCols.includes(k)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${k}\` VARCHAR(255)`);
          existingCols.push(k);
        }
      }

      // Build insert
      const baseCols = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount'];
      const placeholders = ['?', '?', '?', '?', '?'];
      const vals = [invoiceId, item.description || '', quantity, unit_price, itemAmount];

      for (const k of extraKeys) {
        baseCols.push('`' + k + '`');
        placeholders.push('?');
        vals.push(item[k] || null);
      }

      await conn.execute(`INSERT INTO invoice_items (${baseCols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals);
      totalAmount += itemAmount;
    }

    // Update invoice total
    await conn.execute('UPDATE invoices SET total_amount_due = ? WHERE id = ?', [totalAmount, invoiceId]);

    // Payment insertion (if provided)
    if (data.payment) {
      const p = data.payment;
      await conn.execute(
        `INSERT INTO payments (invoice_id, cash, check_payment, check_no, bank, vatable_sales, total_sales,
          vat_exempt, less_vat, zero_rated, net_vat, vat_amount, withholding, total, due, pay_date, payable)
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

    // Footer insertion
    if (data.footer) {
      const f = data.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, invoiceId, invoiceNo, total_amount_due: totalAmount });
  } catch (err) {
    await conn.rollback().catch(()=>{});
    console.error('Create invoice error:', err);
    throw err;
  } finally {
    conn.release();
  }
}

async function updateInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const data = req.body;
  const conn = await getConn();

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || data.items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Invoice not found' }); }
    const invoiceId = rows[0].id;

    // Delete old items/payments/footer
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM payments WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [invoiceId]);

    // Re-insert items (same logic as create)
    const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount'];
    const [colRows] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const existingCols = colRows.map(c => c.Field);

    let totalAmount = 0;
    for (const item of data.items) {
      const quantity = parseFloat(item.quantity) || 0;
      const unit_price = parseFloat(item.unit_price) || 0;
      let itemAmount = quantity * unit_price;

      const extraKeys = Object.keys(item).filter(k => !defaultItemCols.includes(k));
      for (const k of extraKeys) {
        const val = parseFloat(item[k]);
        if (!Number.isNaN(val)) itemAmount += val;
        if (!existingCols.includes(k)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${k}\` VARCHAR(255)`);
          existingCols.push(k);
        }
      }

      const baseCols = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount'];
      const placeholders = ['?', '?', '?', '?', '?'];
      const vals = [invoiceId, item.description || '', quantity, unit_price, itemAmount];

      for (const k of extraKeys) {
        baseCols.push('`' + k + '`');
        placeholders.push('?');
        vals.push(item[k] || null);
      }

      await conn.execute(`INSERT INTO invoice_items (${baseCols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals);
      totalAmount += itemAmount;
    }

    // Update invoices row
    await conn.execute(`UPDATE invoices SET invoice_type=?, bill_to=?, address1=?, address2=?, tin=?, terms=?, date=?, total_amount_due=?, logo=?, extra_columns=?, status=? WHERE id = ?`,
      [
        data.invoice_type || null,
        data.bill_to,
        data.address1 || null,
        data.address2 || null,
        data.tin || null,
        data.terms || null,
        data.date,
        totalAmount,
        data.logo || null,
        JSON.stringify(Object.keys(data.items[0] || {}).filter(k => !['description','quantity','unit_price','amount'].includes(k))),
        data.status || 'draft',
        invoiceId
      ]);

    // Payments/footer if provided (same as create)
    if (data.payment) {
      const p = data.payment;
      await conn.execute(
        `INSERT INTO payments (invoice_id, cash, check_payment, check_no, bank, vatable_sales, total_sales,
          vat_exempt, less_vat, zero_rated, net_vat, vat_amount, withholding, total, due, pay_date, payable)
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
    if (data.footer) {
      const f = data.footer;
      await conn.execute(`INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]);
    }

    await conn.commit();
    res.json({ success: true, invoiceId, total_amount_due: totalAmount });
  } catch (err) {
    await conn.rollback().catch(()=>{});
    console.error('Update invoice error:', err);
    throw err;
  } finally {
    conn.release();
  }
}

async function getInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    const [invoiceRows] = await conn.execute('SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    const [cols] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const colNames = cols.map(c => c.Field);
    const [items] = await conn.execute(`SELECT ${colNames.map(c => '`' + c + '`').join(', ')} FROM invoice_items WHERE invoice_id = ?`, [invoice.id]);

    const [payments] = await conn.execute('SELECT * FROM payments WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [footers] = await conn.execute('SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [company] = await conn.execute('SELECT * FROM company_info LIMIT 1');

    invoice.items = items;
    invoice.payment = payments[0] || {};
    invoice.footer = footers[0] || {};
    invoice.company = company[0] || {};
    invoice.extra_columns = invoice.extra_columns ? JSON.parse(invoice.extra_columns) : [];

    res.json(invoice);
  } finally {
    conn.release();
  }
}

async function listInvoices(req, res) {
  const conn = await getConn();
  try {
    const { status } = req.query;
    let sql = `SELECT i.id, i.invoice_no, i.bill_to, i.date AS invoice_date, i.total_amount_due, i.logo, i.status FROM invoices i`;
    const params = [];
    if (status) {
      sql += ' WHERE i.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY i.date DESC';
    const [rows] = await conn.execute(sql, params);
    res.json(rows);
  } finally {
    conn.release();
  }
}

async function deleteInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Invoice not found' }); }
    const id = rows[0].id;
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM payments WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM invoices WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) {
    await conn.rollback().catch(()=>{});
    throw err;
  } finally {
    conn.release();
  }
}

async function nextInvoiceNo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    if (!rows.length) return res.status(500).json({ error: 'Invoice counter not initialized' });
    const counter = rows[0];
    const nextNumber = (counter.last_number || 0) + 1;
    const invoiceNo = `${counter.prefix}-${String(nextNumber).padStart(6, '0')}`;
    res.json({ invoiceNo });
  } finally {
    conn.release();
  }
}

module.exports = {
  createInvoice,
  updateInvoice,
  getInvoice,
  listInvoices,
  deleteInvoice,
  nextInvoiceNo
};
