/**
 * controllers/invoicesController.js
 *
 * Store tax summary in invoice_tax_summary and ensure frontend/server mapping matches.
 * Also avoid treating the account_id field as an extra item column.
 */

const { getConn } = require('../db/pool');
const { generateInvoiceNo } = require('../utils/invoiceCounter'); // use the utility function
// include account_id so it won't be treated as an extra column
const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount', 'account_id'];

/**
 * Normalize tax summary into DB column keys:
 * { vatable_sales, vat_amount, vat_exempt, zero_rated, subtotal, discount, withholding, total }
 *
 * Accepts:
 * - data.payment (camelCase), or
 * - data.tax_summary / data.taxSummary (snake_case or camelCase)
 */
function normalizeTaxSummary(data) {
  if (!data) return null;

  const raw = data.payment || data.tax_summary || data.taxSummary || null;
  if (!raw) return null;

  const get = keyVariants => {
    for (const k of keyVariants) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) return raw[k];
    }
    return 0;
  };

  const mapped = {
    vatable_sales: parseFloat(get(['vatable_sales', 'vatableSales'])) || 0,
    vat_amount: parseFloat(get(['vat_amount', 'vatAmount'])) || 0,
    vat_exempt: parseFloat(get(['vat_exempt_sales', 'vatExemptSales', 'vat_exempt'])) || 0,
    zero_rated: parseFloat(get(['zero_rated_sales', 'zeroRatedSales', 'zero_rated'])) || 0,
    subtotal: parseFloat(get(['subtotal'])) || 0,
    discount: parseFloat(get(['discount'])) || 0,
    withholding: parseFloat(get(['withholding', 'withholdingTax'])) || 0,
    total: parseFloat(get(['total_payable', 'totalPayable', 'total'])) || 0
  };

  return mapped;
}

// ---------------------- LOAD COMPANY INFO ----------------------
async function getCompanyInfo(req, res) {
  try {
    const conn = await getConn();
    const [rows] = await conn.execute('SELECT * FROM company LIMIT 1');
    conn.release();

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Company info not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error loading company info:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------- CREATE INVOICE ----------------------
async function createInvoice(req, res) {
  const data = req.body;

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || data.items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();
  try {
    await conn.beginTransaction();

    // Use client-provided invoice_no if given, otherwise generate
    const invoiceNo = data.invoice_no || await generateInvoiceNo(conn);

    // Compute extra item columns - prefer client-sent extra_columns if present
    let extraColumns = [];
    if (Array.isArray(data.extra_columns) && data.extra_columns.length) {
      extraColumns = data.extra_columns;
    } else {
      const extraColumnsSet = new Set();
      for (const it of data.items) {
        Object.keys(it || {}).forEach(k => {
          if (!defaultItemCols.includes(k)) extraColumnsSet.add(k);
        });
      }
      extraColumns = Array.from(extraColumnsSet);
    }

    // Insert invoice core
    const invoiceInsertSql = `INSERT INTO invoices
      (invoice_no, invoice_type, bill_to, address, tin, terms, date, due_date, total_amount_due, logo, extra_columns,
       recurrence_type, recurrence_start_date, recurrence_end_date, recurrence_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const [invoiceResult] = await conn.execute(invoiceInsertSql, [
      invoiceNo,
      data.invoice_type || null,
      data.bill_to,
      data.address || null,
      data.tin || null,
      data.terms || null,
      data.date,
      data.due_date || null,
      0,
      data.logo || null,
      JSON.stringify(extraColumns || []),
      data.recurrence_type || null,
      data.recurrence_start_date || null,
      data.recurrence_end_date || null,
      data.recurrence_type ? 'active' : null,
      data.status || 'draft'
    ]);

    const invoiceId = invoiceResult.insertId;

    // ------------------ INSERT ITEMS ------------------
    const [colRows] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const existingCols = colRows.map(c => c.Field);

    let totalAmount = 0;
    for (const item of data.items) {
      const quantity = parseFloat(item.quantity) || 0;
      const unit_price = parseFloat(item.unit_price) || 0;
      let itemAmount = parseFloat(item.amount);
      if (Number.isNaN(itemAmount)) itemAmount = quantity * unit_price;

      const extraKeys = Object.keys(item).filter(k => !defaultItemCols.includes(k));

      for (const k of extraKeys) {
        const val = parseFloat(item[k]);
        if (!Number.isNaN(val) && Number.isNaN(parseFloat(item.amount))) {
          itemAmount += val;
        }

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

      await conn.execute(
        `INSERT INTO invoice_items (${baseCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        vals
      );

      totalAmount += itemAmount;
    }

    // Update invoice total
    await conn.execute('UPDATE invoices SET total_amount_due = ? WHERE id = ?', [totalAmount, invoiceId]);

    // ------------------ INSERT TAX SUMMARY (normalized) ------------------
    const normalized = normalizeTaxSummary(data);
    if (normalized) {
      const vals = [
        invoiceId,
        normalized.vatable_sales,
        normalized.vat_amount,
        normalized.vat_exempt,
        normalized.zero_rated,
        normalized.subtotal,
        normalized.discount,
        normalized.withholding,
        normalized.total,
      ];

      await conn.execute(
        `INSERT INTO invoice_tax_summary
        (invoice_id, vatable_sales, vat_amount, vat_exempt, zero_rated, subtotal, discount, withholding, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        vals
      );
    }

    // ------------------ INSERT FOOTER ------------------
    if (data.footer) {
      const f = data.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, invoiceId, invoiceNo, total_amount_due: totalAmount });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    conn.release();
  }
}

// ---------------------- UPDATE INVOICE ----------------------
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
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Invoice not found' }); }

    const invoiceId = rows[0].id;

    // Delete old items, tax summary, footer
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [invoiceId]);

    // Re-insert items
    const [colRows] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const existingCols = colRows.map(c => c.Field);

    let totalAmount = 0;
    for (const item of data.items) {
      const quantity = parseFloat(item.quantity) || 0;
      const unit_price = parseFloat(item.unit_price) || 0;
      let itemAmount = parseFloat(item.amount);
      if (Number.isNaN(itemAmount)) itemAmount = quantity * unit_price;

      const extraKeys = Object.keys(item).filter(k => !defaultItemCols.includes(k));
      for (const k of extraKeys) {
        const val = parseFloat(item[k]);
        if (!Number.isNaN(val) && Number.isNaN(parseFloat(item.amount))) itemAmount += val;
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

    // Determine extra_columns to store on invoice row
    let extraColumnsToStore = [];
    if (Array.isArray(data.extra_columns) && data.extra_columns.length) {
      extraColumnsToStore = data.extra_columns;
    } else if (data.items && data.items[0]) {
      extraColumnsToStore = Object.keys(data.items[0]).filter(k => !defaultItemCols.includes(k));
    }

    // Update invoice row
    await conn.execute(
      `UPDATE invoices SET invoice_type=?, bill_to=?, address=?, tin=?, terms=?, date=?, total_amount_due=?, logo=?, extra_columns=?, status=? WHERE id=?`,
      [
        data.invoice_type || null,
        data.bill_to,
        data.address || null,
        data.tin || null,
        data.terms || null,
        data.date,
        totalAmount,
        data.logo || null,
        JSON.stringify(extraColumnsToStore || []),
        data.status || 'draft',
        invoiceId
      ]
    );

    // Re-insert tax summary (normalized)
    const normalized = normalizeTaxSummary(data);
    if (normalized) {
      const vals = [
        invoiceId,
        normalized.vatable_sales,
        normalized.vat_amount,
        normalized.vat_exempt,
        normalized.zero_rated,
        normalized.subtotal,
        normalized.discount,
        normalized.withholding,
        normalized.total,
      ];

      await conn.execute(
        `INSERT INTO invoice_tax_summary
        (invoice_id, vatable_sales, vat_amount, vat_exempt, zero_rated, subtotal, discount, withholding, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        vals
      );
    }

    // Re-insert footer
    if (data.footer) {
      const f = data.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]
      );
    }

    await conn.commit();
    res.json({ success: true, invoiceId, total_amount_due: totalAmount });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  } finally {
    conn.release();
  }
}

// ---------------------- GET SINGLE INVOICE ----------------------
async function getInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    const [invoiceRows] = await conn.execute('SELECT * FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (!invoiceRows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceRows[0];

    const [cols] = await conn.execute('SHOW COLUMNS FROM invoice_items');
    const colNames = cols.map(c => c.Field);
    const [items] = await conn.execute(
      `SELECT ${colNames.map(c => '`' + c + '`').join(', ')} FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );

    const [taxRows] = await conn.execute('SELECT * FROM invoice_tax_summary WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [footers] = await conn.execute('SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [company] = await conn.execute('SELECT * FROM company LIMIT 1');

    // Normalize tax summary to frontend-friendly shape (include total_payable)
    const rawTax = taxRows[0] || {};
    const tax_summary = {
      vatable_sales: rawTax.vatable_sales || rawTax.vatableSales || 0,
      vat_amount: rawTax.vat_amount || rawTax.vatAmount || 0,
      vat_exempt: rawTax.vat_exempt || rawTax.vatExempt || 0,
      zero_rated: rawTax.zero_rated || rawTax.zeroRated || 0,
      subtotal: rawTax.subtotal || 0,
      discount: rawTax.discount || 0,
      withholding: rawTax.withholding || rawTax.withholdingTax || 0,
      // frontend expects total_payable; DB column is `total`
      total_payable: rawTax.total || rawTax.total_payable || rawTax.totalPayable || 0
    };

    invoice.items = items;
    invoice.tax_summary = tax_summary;
    invoice.footer = footers[0] || {};
    invoice.company = company[0] || {};
    invoice.extra_columns = invoice.extra_columns ? JSON.parse(invoice.extra_columns) : [];

    res.json(invoice);
  } finally {
    conn.release();
  }
}

// ---------------------- LIST INVOICES ----------------------
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

// ---------------------- DELETE INVOICE ----------------------
async function deleteInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Invoice not found' }); }
    const id = rows[0].id;
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [id]);
    await conn.execute('DELETE FROM invoices WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  } finally {
    conn.release();
  }
}

// ---------------------- NEXT INVOICE NO ----------------------
async function nextInvoiceNo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    if (!rows.length) return res.status(500).json({ error: 'Invoice counter not initialized' });
    const counter = rows[0];
    const nextNumber = (counter.last_number || 0) + 1;
    const invoiceNo = `${counter.prefix}${String(nextNumber).padStart(6, '0')}`;
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
  nextInvoiceNo,
  getCompanyInfo
};