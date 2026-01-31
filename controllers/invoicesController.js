'use strict';

const { getConn } = require('../helpers/db');
const { generateInvoiceNo } = require('../utils/invoiceCounter');
const fetch = require('node-fetch');

const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount', 'account_id'];

/* =========================================================
   HELPERS
========================================================= */

function normalizeTaxSummary(data) {
  if (!data) return null;
  const raw = data.payment || data.tax_summary || data.taxSummary || {};
  const get = keys => {
    for (const k of keys) if (raw[k] !== undefined) return raw[k];
    return 0;
  };

  return {
    subtotal: +get(['subtotal']) || 0,
    discount: +get(['discount']) || 0,
    vatable_sales: +get(['vatable_sales', 'vatableSales']) || 0,
    vat_exempt_sales: +get(['vat_exempt_sales', 'vatExemptSales']) || 0,
    zero_rated_sales: +get(['zero_rated_sales', 'zeroRatedSales']) || 0,
    vat_amount: +get(['vat_amount', 'vatAmount']) || 0,
    withholding: +get(['withholding', 'withholdingTax']) || 0,
    total_payable: +get(['total_payable', 'totalPayable', 'total']) || 0
  };
}

async function getExchangeRate(currency = 'PHP') {
  currency = currency.toUpperCase();
  if (currency === 'PHP') return 1;

  const fallbackRates = { USD: 56, SGD: 42, AUD: 38, EUR: 60 };

  try {
    const res = await fetch('https://www.bap.org.ph/downloads/daily-rates.json', { timeout: 5000 });
    if (!res.ok) throw new Error();
    const rates = await res.json();
    const rate = parseFloat(rates[currency]);
    if (!rate || rate <= 0) throw new Error();
    return rate;
  } catch {
    return fallbackRates[currency] || 1;
  }
}

/* =========================================================
   COMPANY INFO
========================================================= */

async function getCompanyInfo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    if (!rows.length) return res.status(404).json({ error: 'Company info not found' });
    res.json(rows[0]);
  } finally {
    conn.release();
  }
}

/* =========================================================
   CREATE INVOICE (POST)
========================================================= */

async function createInvoice(req, res) {
  const data = { ...req.body };

  // ✅ HARDENING FIX:
  // Ignore invoice_no if client accidentally sends it
  if (data.invoice_no) {
    delete data.invoice_no;
  }

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();

  try {
    await conn.beginTransaction();

    const currency = (data.currency || 'PHP').toUpperCase();
    const exchangeRate = await getExchangeRate(currency);

    // ✅ Server is the ONLY source of truth
    const invoiceNo = await generateInvoiceNo(conn);

    const [result] = await conn.execute(
      `INSERT INTO invoices
       (invoice_no, invoice_mode, invoice_category, invoice_type,
        bill_to, address, tin, terms,
        currency, exchange_rate,
        date, due_date,
        total_amount_due, foreign_total,
        logo, extra_columns,
        recurrence_type, recurrence_start_date, recurrence_end_date, recurrence_status,
        status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        data.invoice_mode || 'standard',
        data.invoice_category || 'service',
        data.invoice_type || 'SERVICE INVOICE',
        data.bill_to,
        data.address || null,
        data.tin || null,
        data.terms || null,
        currency,
        exchangeRate,
        data.date,
        data.due_date || null,
        data.logo || null,
        JSON.stringify(data.extra_columns || []),
        data.recurrence_type || null,
        data.recurrence_start_date || null,
        data.recurrence_end_date || null,
        data.recurrence_type ? 'active' : null,
        data.status || 'draft',
        req.session.user.id
      ]
    );

    const invoiceId = result.insertId;

    const totalAmount = await insertItems(conn, invoiceId, data.items);
    const foreignTotal = +(totalAmount / exchangeRate).toFixed(2);

    await conn.execute(
      `UPDATE invoices SET total_amount_due=?, foreign_total=? WHERE id=?`,
      [totalAmount, foreignTotal, invoiceId]
    );

    await insertTaxAndFooter(conn, invoiceId, data);

    await conn.commit();

    res.status(201).json({
      success: true,
      invoiceNo,
      invoiceId,
      currency,
      exchange_rate: exchangeRate
    });

  } catch (err) {
    await conn.rollback();
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    conn.release();
  }
}

/* =========================================================
   UPDATE INVOICE (PUT)
========================================================= */

async function updateInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const data = req.body;

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();

  try {
    await conn.beginTransaction();

    const [[invoice]] = await conn.execute(
      'SELECT id FROM invoices WHERE invoice_no=? LIMIT 1',
      [invoiceNo]
    );

    if (!invoice) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const currency = (data.currency || 'PHP').toUpperCase();
    const exchangeRate = await getExchangeRate(currency);

    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [invoice.id]);

    const totalAmount = await insertItems(conn, invoice.id, data.items);
    const foreignTotal = +(totalAmount / exchangeRate).toFixed(2);

    await conn.execute(
      `UPDATE invoices
       SET invoice_mode=?, invoice_category=?, invoice_type=?,
           bill_to=?, address=?, tin=?, terms=?,
           date=?, due_date=?,
           total_amount_due=?, foreign_total=?,
           currency=?, exchange_rate=?,
           logo=?, extra_columns=?, status=?
       WHERE id=?`,
      [
        data.invoice_mode || 'standard',
        data.invoice_category || 'service',
        data.invoice_type || 'SERVICE INVOICE',
        data.bill_to,
        data.address || null,
        data.tin || null,
        data.terms || null,
        data.date,
        data.due_date || null,
        totalAmount,
        foreignTotal,
        currency,
        exchangeRate,
        data.logo || null,
        JSON.stringify(data.extra_columns || []),
        data.status || 'draft',
        invoice.id
      ]
    );

    await insertTaxAndFooter(conn, invoice.id, data);

    await conn.commit();
    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  } finally {
    conn.release();
  }
}

/* =========================================================
   GET / LIST / DELETE / NEXT
========================================================= */

async function getInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();

  try {
    const [[invoice]] = await conn.execute(
      'SELECT * FROM invoices WHERE invoice_no=? LIMIT 1',
      [invoiceNo]
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const [items] = await conn.execute('SELECT * FROM invoice_items WHERE invoice_id=?', [invoice.id]);
    const [[tax]] = await conn.execute('SELECT * FROM invoice_tax_summary WHERE invoice_id=? LIMIT 1', [invoice.id]);
    const [[footer]] = await conn.execute('SELECT * FROM invoice_footer WHERE invoice_id=? LIMIT 1', [invoice.id]);
    const [[company]] = await conn.execute('SELECT * FROM company_info LIMIT 1');

    invoice.items = items;
    invoice.tax_summary = tax || {};
    invoice.footer = footer || {};
    invoice.company = company || {};
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
    let sql = `
      SELECT invoice_no, bill_to, date, due_date,
             total_amount_due, foreign_total,
             status, currency, exchange_rate
      FROM invoices
    `;
    const params = [];

    if (status) {
      sql += ' WHERE status=?';
      params.push(status);
    }

    sql += ' ORDER BY date DESC';

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

    const [[inv]] = await conn.execute(
      'SELECT id FROM invoices WHERE invoice_no=? LIMIT 1',
      [invoiceNo]
    );
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [inv.id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id=?', [inv.id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [inv.id]);
    await conn.execute('DELETE FROM invoices WHERE id=?', [inv.id]);

    await conn.commit();
    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Failed to delete invoice' });
  } finally {
    conn.release();
  }
}

async function nextInvoiceNo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    const counter = rows[0];

    const [[max]] = await conn.execute(
      `SELECT MAX(CAST(SUBSTRING(invoice_no, ?) AS UNSIGNED)) AS max_no FROM invoices`,
      [counter.prefix.length + 1]
    );

    const next = Math.max(counter.last_number || 0, max.max_no || 0) + 1;
    res.json({ invoiceNo: `${counter.prefix}${String(next).padStart(6, '0')}` });
  } finally {
    conn.release();
  }
}

/* =========================================================
   SHARED INSERTS
========================================================= */

async function insertItems(conn, invoiceId, items) {
  let total = 0;

  for (const it of items) {
    const qty = +it.quantity || 0;
    const price = +it.unit_price || 0;
    const amount = +it.amount || qty * price;

    await conn.execute(
      `INSERT INTO invoice_items
       (invoice_id, description, quantity, unit_price, amount, account_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, it.description || '', qty, price, amount, it.account_id || null]
    );

    total += amount;
  }
  return total;
}

async function insertTaxAndFooter(conn, invoiceId, data) {
  const tax = normalizeTaxSummary(data);
  if (tax) {
    await conn.execute(
      `INSERT INTO invoice_tax_summary
       (invoice_id, subtotal, discount, vatable_sales, vat_exempt_sales,
        zero_rated_sales, vat_amount, withholding, total_payable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, ...Object.values(tax)]
    );
  }

  if (data.footer) {
    const f = data.footer;
    await conn.execute(
      `INSERT INTO invoice_footer
       (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, f.atp_no, f.atp_date, f.bir_permit_no, f.bir_date, f.serial_nos]
    );
  }
}

/* ========================================================= */

module.exports = {
  createInvoice,
  updateInvoice,
  getInvoice,
  listInvoices,
  deleteInvoice,
  nextInvoiceNo,
  getCompanyInfo,
  getExchangeRate,
  normalizeTaxSummary
};
