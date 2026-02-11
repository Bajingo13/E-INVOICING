'use strict';

const { getConn, pool } = require('../helpers/db');

// Robust fetch (Node 18+ has global fetch, otherwise uses node-fetch v2)
const fetchFn = global.fetch || require('node-fetch');
const AbortCtrl = global.AbortController || require('abort-controller');

const { logAudit } = require('../helpers/audit');

const {
  generateInvoiceNo,
  previewNextInvoiceNo,
  getInvoiceCounter
} = require('../utils/invoiceCounter');

const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount', 'account_id'];

/* =========================================================
   AUDIT SNAPSHOTS (keep small + meaningful)
========================================================= */

function pickInvoiceSnapshot(inv) {
  if (!inv) return null;
  return {
    invoice_no: inv.invoice_no,
    status: inv.status,
    bill_to: inv.bill_to,
    date: inv.date,
    due_date: inv.due_date,
    currency: inv.currency,
    exchange_rate: inv.exchange_rate,
    vat_type: inv.vat_type,
    total_amount_due: inv.total_amount_due,
    foreign_total: inv.foreign_total,
    terms: inv.terms
  };
}

function diffKeys(before, after) {
  const b = before || {};
  const a = after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) changed.push(k);
  }
  return changed;
}

async function getInvoiceAuditState(conn, invoiceNoOrId) {
  // invoiceNoOrId can be invoice_no or id (we will detect)
  const isId = typeof invoiceNoOrId === 'number' || /^\d+$/.test(String(invoiceNoOrId));
  const where = isId ? 'id = ?' : 'invoice_no = ?';

  const [[inv]] = await conn.execute(
    `SELECT invoice_no, status, bill_to, date, due_date, currency, exchange_rate, vat_type,
            total_amount_due, foreign_total, terms
     FROM invoices
     WHERE ${where}
     LIMIT 1`,
    [invoiceNoOrId]
  );

  if (!inv) return { inv: null, items_count: 0 };

  const [[c]] = await conn.execute(
    `SELECT COUNT(*) AS total
     FROM invoice_items
     INNER JOIN invoices ON invoices.id = invoice_items.invoice_id
     WHERE invoices.invoice_no = ?`,
    [inv.invoice_no]
  );

  return { inv, items_count: Number(c?.total || 0) };
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeTaxSummary(data) {
  if (!data) return null;

  const raw = data.payment || data.tax_summary || data.taxSummary || {};

  const get = (keys) => {
    for (const k of keys) {
      if (raw?.[k] !== undefined && raw?.[k] !== null) return raw[k];
    }
    return 0;
  };

  return {
    subtotal: +get(['subtotal']) || 0,
    discount: +get(['discount']) || 0,
    vatable_sales: +get(['vatable_sales', 'vatableSales']) || 0,
    vat_exempt_sales: +get(['vat_exempt_sales', 'vatExemptSales']) || 0,
    zero_rated_sales: +get(['zero_rated_sales', 'zeroRatedSales']) || 0,
    vat_amount: +get(['vat_amount', 'vatAmount']) || 0,

    withholding: +get([
      'withholding',
      'withholdingTax',
      'withholding_tax_amount',
      'withholdingTaxAmount',
      'withholding_tax'
    ]) || 0,

    total_payable: +get(['total_payable', 'totalPayable', 'total']) || 0
  };
}

function normalizeVatType(v) {
  const val = String(v || '').toLowerCase().trim();
  const allowed = new Set(['inclusive', 'exclusive', 'exempt', 'zero']);
  return allowed.has(val) ? val : 'inclusive';
}

async function getExchangeRate(currency = 'PHP') {
  currency = currency.toUpperCase();
  if (currency === 'PHP') return 1;

  const fallbackRates = { USD: 56, SGD: 42, AUD: 38, EUR: 60 };

  try {
    const controller = new AbortCtrl();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetchFn('https://www.bap.org.ph/downloads/daily-rates.json', {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error('BAP not ok');
    const rates = await res.json();

    const rate = parseFloat(rates[currency]);
    if (!rate || rate <= 0) throw new Error('bad rate');

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

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();

  let invoiceNo = '';
  let invoiceId = null;
  let exchangeRate = 1;
  let currency = 'PHP';

  try {
    const counter = await getInvoiceCounter(conn);
    const mode = String(counter.numbering_mode || 'auto').toLowerCase();

    // MANUAL MODE: validate invoice_no before transaction
    if (mode === 'manual') {
      invoiceNo = String(data.invoice_no || '').trim();
      if (!invoiceNo) {
        return res.status(400).json({ error: 'Invoice number is required (manual mode)' });
      }

      const [exists] = await conn.execute(
        'SELECT COUNT(*) AS count FROM invoices WHERE invoice_no = ?',
        [invoiceNo]
      );
      if ((exists?.[0]?.count || 0) > 0) {
        return res.status(400).json({ error: 'Invoice number already exists' });
      }
    }

    await conn.beginTransaction();

    currency = (data.currency || 'PHP').toUpperCase();
    exchangeRate = await getExchangeRate(currency);

    if (mode === 'auto') {
      invoiceNo = await generateInvoiceNo(conn);
    }

    const vatType = normalizeVatType(data.vat_type);

    const [result] = await conn.execute(
      `INSERT INTO invoices
       (invoice_no, invoice_mode, invoice_category, invoice_type,
        bill_to, address, tin, terms,
        currency, exchange_rate,
        vat_type,
        date, due_date,
        total_amount_due, foreign_total,
        logo, extra_columns,
        recurrence_type, recurrence_start_date, recurrence_end_date, recurrence_status,
        status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        vatType,
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

    invoiceId = result.insertId;

    const totalAmount = await insertItems(conn, invoiceId, data.items);
    const foreignTotal = +(totalAmount / exchangeRate).toFixed(2);

    await conn.execute(
      `UPDATE invoices SET total_amount_due=?, foreign_total=? WHERE id=?`,
      [totalAmount, foreignTotal, invoiceId]
    );

    await insertTaxAndFooter(conn, invoiceId, data);

    await conn.commit();

    // ✅ AUDIT (transaction-only)
    try {
      const stateConn = await getConn();
      try {
        const { inv, items_count } = await getInvoiceAuditState(stateConn, invoiceNo);
        await logAudit(pool, req, {
          action: 'invoice.create',
          entity_type: 'invoice',
          entity_id: invoiceNo,
          summary: `Created invoice ${invoiceNo}`,
          success: 1,
          after: pickInvoiceSnapshot(inv),
          meta: { items_count }
        });
      } finally {
        stateConn.release();
      }
    } catch (e) {
      console.error('Audit log (invoice.create) failed:', e);
    }

    res.status(201).json({
      success: true,
      invoiceNo,
      invoiceId,
      currency,
      exchange_rate: exchangeRate
    });

  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Create invoice error:', err);

    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    // Optional: audit failed create attempts (still "transactional", but failed)
    try {
      await logAudit(pool, req, {
        action: 'invoice.create',
        entity_type: 'invoice',
        entity_id: invoiceNo || null,
        summary: 'Create invoice failed',
        success: 0,
        meta: { error: String(err?.code || err?.message || 'unknown') }
      });
    } catch {}

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

  let beforeSnap = null;
  let beforeItemsCount = 0;

  try {
    // BEFORE snapshot (small + meaningful)
    {
      const { inv, items_count } = await getInvoiceAuditState(conn, invoiceNo);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
      beforeSnap = pickInvoiceSnapshot(inv);
      beforeItemsCount = items_count;
    }

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

    const vatType = normalizeVatType(data.vat_type);

    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [invoice.id]);

    const totalAmount = await insertItems(conn, invoice.id, data.items);
    const foreignTotal = +(totalAmount / exchangeRate).toFixed(2);

    await conn.execute(
      `UPDATE invoices
       SET invoice_mode=?, invoice_category=?, invoice_type=?,
           bill_to=?, address=?, tin=?, terms=?,
           currency=?, exchange_rate=?,
           vat_type=?,
           date=?, due_date=?,
           total_amount_due=?, foreign_total=?,
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
        currency,
        exchangeRate,
        vatType,
        data.date,
        data.due_date || null,
        totalAmount,
        foreignTotal,
        data.logo || null,
        JSON.stringify(data.extra_columns || []),
        data.status || 'draft',
        invoice.id
      ]
    );

    await insertTaxAndFooter(conn, invoice.id, data);

    await conn.commit();

    // AFTER snapshot + audit
    try {
      const stateConn = await getConn();
      try {
        const { inv: afterInv, items_count: afterItemsCount } = await getInvoiceAuditState(stateConn, invoiceNo);
        const afterSnap = pickInvoiceSnapshot(afterInv);

        await logAudit(pool, req, {
          action: 'invoice.update',
          entity_type: 'invoice',
          entity_id: invoiceNo,
          summary: `Updated invoice ${invoiceNo}`,
          success: 1,
          before: { ...beforeSnap, items_count: beforeItemsCount },
          after: { ...afterSnap, items_count: afterItemsCount },
          meta: {
            changed_fields: diffKeys(beforeSnap, afterSnap),
            items_count_before: beforeItemsCount,
            items_count_after: afterItemsCount
          }
        });
      } finally {
        stateConn.release();
      }
    } catch (e) {
      console.error('Audit log (invoice.update) failed:', e);
    }

    res.json({ success: true });

  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Update invoice error:', err);

    try {
      await logAudit(pool, req, {
        action: 'invoice.update',
        entity_type: 'invoice',
        entity_id: invoiceNo,
        summary: `Update invoice ${invoiceNo} failed`,
        success: 0,
        meta: { error: String(err?.code || err?.message || 'unknown') }
      });
    } catch {}

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
             status, currency, exchange_rate, vat_type
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

  // Capture BEFORE snapshot (transactional)
  let beforeSnap = null;
  let beforeItemsCount = 0;

  try {
    const { inv, items_count } = await getInvoiceAuditState(conn, invoiceNo);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    beforeSnap = pickInvoiceSnapshot(inv);
    beforeItemsCount = items_count;

    await conn.beginTransaction();

    const [[invRow]] = await conn.execute(
      'SELECT id FROM invoices WHERE invoice_no=? LIMIT 1',
      [invoiceNo]
    );
    if (!invRow) return res.status(404).json({ error: 'Invoice not found' });

    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [invRow.id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id=?', [invRow.id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [invRow.id]);
    await conn.execute('DELETE FROM invoices WHERE id=?', [invRow.id]);

    await conn.commit();

    // ✅ AUDIT delete
    try {
      await logAudit(pool, req, {
        action: 'invoice.delete',
        entity_type: 'invoice',
        entity_id: invoiceNo,
        summary: `Deleted invoice ${invoiceNo}`,
        success: 1,
        before: { ...beforeSnap, items_count: beforeItemsCount }
      });
    } catch (e) {
      console.error('Audit log (invoice.delete) failed:', e);
    }

    res.json({ success: true });

  } catch (err) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'Failed to delete invoice' });
  } finally {
    conn.release();
  }
}

async function nextInvoiceNo(req, res) {
  const conn = await getConn();
  try {
    const out = await previewNextInvoiceNo(conn);
    res.json(out);
  } catch (err) {
    console.error('nextInvoiceNo error:', err);
    res.status(500).json({ error: 'Failed to get next invoice number' });
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

    const ewtId = it.ewt_id ? Number(it.ewt_id) : null;

    await conn.execute(
      `INSERT INTO invoice_items
       (invoice_id, description, quantity, unit_price, amount, account_id, ewt_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, it.description || '', qty, price, amount, it.account_id || null, ewtId]
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
      [
        invoiceId,
        tax.subtotal,
        tax.discount,
        tax.vatable_sales,
        tax.vat_exempt_sales,
        tax.zero_rated_sales,
        tax.vat_amount,
        tax.withholding,
        tax.total_payable
      ]
    );
  }

  const f = data.footer || {};
  await conn.execute(
    `INSERT INTO invoice_footer
     (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [invoiceId, f.atp_no || '', f.atp_date || null, f.bir_permit_no || '', f.bir_date || null, f.serial_nos || '']
  );
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
