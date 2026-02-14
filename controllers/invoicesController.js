'use strict';

const { getConn, pool } = require('../helpers/db');

// Robust fetch (Node 18+ has global fetch, otherwise uses node-fetch v2)
const fetchFn = global.fetch || require('node-fetch');
const AbortCtrl = global.AbortController || require('abort-controller');

const { logAudit } = require('../helpers/audit');
const { getApprovers } = require('../utils/getApprovers');

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
    created_by: inv.created_by,
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
    `SELECT invoice_no, status, created_by, bill_to, date, due_date, currency, exchange_rate, vat_type,
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

async function notifyPendingInvoiceEdited(invoiceNo) {
  const approvers = await getApprovers();
  const [admins] = await pool.query(
    `SELECT id FROM users WHERE role IN ('admin','super','super_admin')`
  );

  const recipients = [...approvers, ...admins];
  const uniqueIds = [...new Set(recipients.map(u => u.id))];

  for (const userId of uniqueIds) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, reference_no, message)
       VALUES (?, 'INVOICE_PENDING_EDITED', ?, ?)`,
      [userId, invoiceNo, `Invoice ${invoiceNo} was modified while pending approval`]
    );
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
   - Snapshots company_info into invoices.company_snapshot
   - Recurring validation happens BEFORE transaction (no hanging tx)
========================================================= */

async function createInvoice(req, res) {
  const data = { ...req.body };

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ✅ normalize mode ONCE (case-insensitive everywhere)
  const invoiceMode = String(data.invoice_mode || 'standard').toLowerCase();

  // ✅ validate recurring payload BEFORE transaction
  if (invoiceMode === 'recurring') {
    if (!data.recurrence_start_date) {
      return res.status(400).json({ error: 'Recurring invoice requires recurrence_start_date' });
    }
    data.recurrence_type = data.recurrence_type || 'monthly';
    data.recurrence_status = data.recurrence_status || 'active';
  } else {
    // force-clean if standard
    data.recurrence_type = null;
    data.recurrence_start_date = null;
    data.recurrence_end_date = null;
    data.recurrence_status = null;
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

    // ✅ use client-provided exchange_rate if valid, otherwise fetch
    exchangeRate =
      (data.exchange_rate && Number(data.exchange_rate) > 0)
        ? Number(data.exchange_rate)
        : await getExchangeRate(currency);

    if (mode === 'auto') {
      invoiceNo = await generateInvoiceNo(conn);
    }

    const vatType = normalizeVatType(data.vat_type);

    // ✅ Snapshot company info for this invoice (so future updates won't affect old invoices)
    const [[companyRow]] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    const companySnapshot = companyRow
      ? {
          company_name: companyRow.company_name || '',
          company_address: companyRow.company_address || '',
          tel_no: companyRow.tel_no || '',
          vat_tin: companyRow.vat_tin || '',
          logo_path: companyRow.logo_path || ''
        }
      : null;

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
        status, created_by,
        company_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        invoiceMode,
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

        // ✅ start at 0, will be updated after items insert
        0,
        0,

        data.logo || null,
        JSON.stringify(data.extra_columns || []),

        // ✅ recurrence fields (only if recurring mode)
        invoiceMode === 'recurring' ? (data.recurrence_type || 'monthly') : null,
        invoiceMode === 'recurring' ? (data.recurrence_start_date || null) : null,
        invoiceMode === 'recurring' ? (data.recurrence_end_date || null) : null,
        invoiceMode === 'recurring' ? (data.recurrence_status || 'active') : null,

        data.status || 'draft',
        req.session.user.id,

        companySnapshot ? JSON.stringify(companySnapshot) : null
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

    // Optional: audit failed create attempts
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
   - Does NOT modify company_snapshot (keeps original)
   - If invoice is pending, submitter/admin can edit,
     status stays pending, audit + notify approvers/admins
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
  let beforeInvRow = null;

  try {
    // BEFORE snapshot
    {
      const { inv, items_count } = await getInvoiceAuditState(conn, invoiceNo);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
      beforeInvRow = inv;
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

    // ✅ use client-provided exchange_rate if valid, otherwise fetch
    const exchangeRate =
      (data.exchange_rate && Number(data.exchange_rate) > 0)
        ? Number(data.exchange_rate)
        : await getExchangeRate(currency);

    const vatType = normalizeVatType(data.vat_type);

    // ✅ pending rules
    const isPending = String(beforeInvRow?.status || '').toLowerCase() === 'pending';
    const role = req.session.user?.role;
    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
    const isOwner = Number(beforeInvRow?.created_by) === Number(req.session.user?.id);

    if (isPending && !isOwner && !isAdmin) {
      await conn.rollback();
      return res.status(403).json({ error: 'Only the submitter can edit a pending invoice' });
    }

    const nextStatus = isPending ? 'pending' : (data.status || 'draft');

    await conn.execute('DELETE FROM invoice_items WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id=?', [invoice.id]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id=?', [invoice.id]);

    const totalAmount = await insertItems(conn, invoice.id, data.items);
    const foreignTotal = +(totalAmount / exchangeRate).toFixed(2);

    // ✅ normalize + validate recurring on update
    const nextMode = String(data.invoice_mode || 'standard').toLowerCase();
    let recType = null, recStart = null, recEnd = null, recStatus = null;

    if (nextMode === 'recurring') {
      recType = data.recurrence_type || 'monthly';
      recStart = data.recurrence_start_date || null;
      recEnd = data.recurrence_end_date || null;
      recStatus = data.recurrence_status || 'active';

      if (!recStart) {
        await conn.rollback();
        return res.status(400).json({ error: 'Recurring invoice requires recurrence_start_date' });
      }
    }

    await conn.execute(
      `UPDATE invoices
       SET invoice_mode=?, invoice_category=?, invoice_type=?,
           bill_to=?, address=?, tin=?, terms=?,
           currency=?, exchange_rate=?,
           vat_type=?,
           date=?, due_date=?,
           total_amount_due=?, foreign_total=?,
           logo=?, extra_columns=?,
           recurrence_type=?, recurrence_start_date=?, recurrence_end_date=?, recurrence_status=?,
           status=?
       WHERE id=?`,
      [
        nextMode,
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

        // ✅ recurrence
        recType,
        recStart,
        recEnd,
        recStatus,

        // ✅ keep pending if it was pending
        nextStatus,

        invoice.id
      ]
    );

    await insertTaxAndFooter(conn, invoice.id, data);

    await conn.commit();

    // AFTER snapshot + audit (+ pending notifications)
    try {
      const stateConn = await getConn();
      try {
        const { inv: afterInv, items_count: afterItemsCount } = await getInvoiceAuditState(stateConn, invoiceNo);
        const afterSnap = pickInvoiceSnapshot(afterInv);

        const changedFields = diffKeys(beforeSnap, afterSnap);

        await logAudit(pool, req, {
          action: isPending ? 'invoice.update_pending' : 'invoice.update',
          entity_type: 'invoice',
          entity_id: invoiceNo,
          summary: isPending
            ? `Updated invoice ${invoiceNo} while pending (status stays pending)`
            : `Updated invoice ${invoiceNo}`,
          success: 1,
          before: { ...beforeSnap, items_count: beforeItemsCount },
          after: { ...afterSnap, items_count: afterItemsCount },
          meta: {
            changed_fields: changedFields,
            items_count_before: beforeItemsCount,
            items_count_after: afterItemsCount
          }
        });
      } finally {
        stateConn.release();
      }

      if (isPending) {
        await notifyPendingInvoiceEdited(invoiceNo);
      }
    } catch (e) {
      console.error('Audit/notify (invoice.update) failed:', e);
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

    // ✅ Company info: use per-invoice snapshot first; fallback to current company_info for legacy invoices
    let company = null;

    if (invoice.company_snapshot) {
      try {
        company = (typeof invoice.company_snapshot === 'string')
          ? JSON.parse(invoice.company_snapshot)
          : invoice.company_snapshot;
      } catch {
        company = null;
      }
    }

    if (!company) {
      const [[companyRow]] = await conn.execute('SELECT * FROM company_info LIMIT 1');
      company = companyRow
        ? {
            company_name: companyRow.company_name || '',
            company_address: companyRow.company_address || '',
            tel_no: companyRow.tel_no || '',
            vat_tin: companyRow.vat_tin || '',
            logo_path: companyRow.logo_path || ''
          }
        : {};
    }

    invoice.items = items;
    invoice.tax_summary = tax || {};
    invoice.footer = footer || {};
    invoice.company = company || {};
    invoice.extra_columns = invoice.extra_columns ? JSON.parse(invoice.extra_columns) : [];

    // Optional: don't expose raw snapshot field to frontend
    delete invoice.company_snapshot;

    res.json(invoice);
  } finally {
    conn.release();
  }
}

async function listInvoices(req, res) {
  const conn = await getConn();
  try {
    // normalize status filter
    const statusRaw = String(req.query.status || '').trim().toLowerCase();

    // allow only these statuses (matches your system)
    const allowed = new Set(['draft', 'returned', 'pending', 'approved', 'paid', 'canceled']);

    const hasStatusFilter = statusRaw && statusRaw !== 'all' && allowed.has(statusRaw);

    let sql = `
      SELECT invoice_no, bill_to, date, due_date,
             total_amount_due, foreign_total,
             status, currency, exchange_rate, vat_type,
             created_by
      FROM invoices
    `;
    const params = [];

    if (hasStatusFilter) {
      sql += ` WHERE status = ?`;
      params.push(statusRaw);
    }

    sql += ` ORDER BY date DESC`;

    const [rows] = await conn.execute(sql, params);
    res.json(rows);
  } finally {
    conn.release();
  }
}

async function deleteInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const conn = await getConn();

  // Capture BEFORE snapshot
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
      `
      INSERT INTO invoice_tax_summary
        (invoice_id, subtotal, discount, vatable_sales, vat_exempt_sales,
         zero_rated_sales, vat_amount, withholding, total_payable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        subtotal = VALUES(subtotal),
        discount = VALUES(discount),
        vatable_sales = VALUES(vatable_sales),
        vat_exempt_sales = VALUES(vat_exempt_sales),
        zero_rated_sales = VALUES(zero_rated_sales),
        vat_amount = VALUES(vat_amount),
        withholding = VALUES(withholding),
        total_payable = VALUES(total_payable)
      `,
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
