'use strict';

const { getConn } = require('../helpers/db');
const { generateInvoiceNo } = require('../utils/invoiceCounter');

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ✅ Converts DATE-ish input safely to YYYY-MM-DD (handles JS Date or string)
function normalizeISODate(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    // if already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // fallback: Date parse
    return toISODate(new Date(v));
  }
  // Date object
  return toISODate(new Date(v));
}

function addMonthsClamp(isoDate, monthsToAdd) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const desiredDay = d;

  const first = new Date(y, m - 1 + monthsToAdd, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const day = Math.min(desiredDay, lastDay);

  return toISODate(new Date(first.getFullYear(), first.getMonth(), day));
}

function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(days || 0));
  return toISODate(dt);
}

function parseTermsToDays(terms) {
  const s = String(terms || '').toLowerCase();
  const m = s.match(/(\d{1,3})/);
  return m ? (Number(m[1]) || 0) : 0;
}

async function cloneInvoiceItems(conn, templateId, newInvoiceId) {
  const [items] = await conn.execute(
    `SELECT description, quantity, unit_price, amount, account_id, ewt_id
     FROM invoice_items
     WHERE invoice_id = ?`,
    [templateId]
  );

  let total = 0;

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    const amount =
      (it.amount !== null && it.amount !== undefined)
        ? Number(it.amount)
        : (qty * price);

    await conn.execute(
      `INSERT INTO invoice_items
       (invoice_id, description, quantity, unit_price, amount, account_id, ewt_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newInvoiceId,
        it.description || '',
        qty,
        price,
        amount,
        it.account_id || null,
        it.ewt_id || null
      ]
    );

    total += amount;
  }

  return Number(total.toFixed(2));
}

async function cloneTaxSummary(conn, templateId, newInvoiceId) {
  const [[tax]] = await conn.execute(
    `SELECT subtotal, discount, vatable_sales, vat_exempt_sales, zero_rated_sales, vat_amount, withholding, total_payable
     FROM invoice_tax_summary
     WHERE invoice_id = ?
     LIMIT 1`,
    [templateId]
  );

  if (!tax) return;

  await conn.execute(
    `INSERT INTO invoice_tax_summary
      (invoice_id, subtotal, discount, vatable_sales, vat_exempt_sales, zero_rated_sales, vat_amount, withholding, total_payable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       subtotal=VALUES(subtotal),
       discount=VALUES(discount),
       vatable_sales=VALUES(vatable_sales),
       vat_exempt_sales=VALUES(vat_exempt_sales),
       zero_rated_sales=VALUES(zero_rated_sales),
       vat_amount=VALUES(vat_amount),
       withholding=VALUES(withholding),
       total_payable=VALUES(total_payable)`,
    [
      newInvoiceId,
      Number(tax.subtotal) || 0,
      Number(tax.discount) || 0,
      Number(tax.vatable_sales) || 0,
      Number(tax.vat_exempt_sales) || 0,
      Number(tax.zero_rated_sales) || 0,
      Number(tax.vat_amount) || 0,
      Number(tax.withholding) || 0,
      Number(tax.total_payable) || 0
    ]
  );
}

async function cloneFooter(conn, templateId, newInvoiceId) {
  const [[f]] = await conn.execute(
    `SELECT atp_no, atp_date, bir_permit_no, bir_date, serial_nos
     FROM invoice_footer
     WHERE invoice_id = ?
     LIMIT 1`,
    [templateId]
  );

  if (!f) return;

  await conn.execute(
    `INSERT INTO invoice_footer
     (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       atp_no=VALUES(atp_no),
       atp_date=VALUES(atp_date),
       bir_permit_no=VALUES(bir_permit_no),
       bir_date=VALUES(bir_date),
       serial_nos=VALUES(serial_nos)`,
    [
      newInvoiceId,
      f.atp_no || '',
      f.atp_date || null,
      f.bir_permit_no || '',
      f.bir_date || null,
      f.serial_nos || ''
    ]
  );
}

async function cloneInvoiceRow(conn, tpl, runDateISO) {
  const termDays = parseTermsToDays(tpl.terms);
  const dueDateISO = termDays ? addDaysISO(runDateISO, termDays) : null;

  // ✅ generate invoice_no (avoid NULL/unique errors)
  const newInvoiceNo = await generateInvoiceNo(conn);

  const currency = (tpl.currency || 'PHP').toUpperCase();
  const exchangeRate = Number(tpl.exchange_rate) > 0 ? Number(tpl.exchange_rate) : 1;

  const [ins] = await conn.execute(
    `
    INSERT INTO invoices (
      invoice_no,
      invoice_mode,
      invoice_category,
      invoice_type,
      bill_to,
      address,
      tin,
      terms,
      currency,
      exchange_rate,
      vat_type,
      date,
      due_date,
      total_amount_due,
      foreign_total,
      logo,
      extra_columns,
      recurrence_type,
      recurrence_start_date,
      recurrence_end_date,
      recurrence_status,
      status,
      created_by,
      company_snapshot
    ) VALUES (
      ?,
      'standard',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL, NULL, NULL, NULL,
      'draft', ?, ?
    )
    `,
    [
      newInvoiceNo,
      tpl.invoice_category || 'service',
      tpl.invoice_type || 'SERVICE INVOICE',
      tpl.bill_to || '',
      tpl.address || null,
      tpl.tin || null,
      tpl.terms || null,
      currency,
      exchangeRate,
      tpl.vat_type || 'inclusive',
      runDateISO,
      dueDateISO,
      0,
      0,
      tpl.logo || null,
      tpl.extra_columns || JSON.stringify([]),
      tpl.created_by,
      tpl.company_snapshot || null
    ]
  );

  return { id: ins.insertId, invoice_no: newInvoiceNo };
}

async function runMonthlyRecurringInvoices({ todayISO } = {}) {
  const conn = await getConn();

  // ✅ default todayISO if not provided
  const today = todayISO || toISODate(new Date());

  try {
    await conn.beginTransaction();

    // ✅ Pull DATEs as YYYY-MM-DD strings to avoid timezone shifts
    const [templates] = await conn.execute(
      `
      SELECT
        i.*,
        DATE_FORMAT(i.recurrence_start_date, '%Y-%m-%d') AS next_run_iso,
        (CASE WHEN i.recurrence_end_date IS NULL THEN NULL
              ELSE DATE_FORMAT(i.recurrence_end_date, '%Y-%m-%d')
         END) AS end_run_iso
      FROM invoices i
      WHERE i.invoice_mode = 'recurring'
        AND i.recurrence_type = 'monthly'
        AND i.recurrence_status = 'active'
        AND i.recurrence_start_date IS NOT NULL
        AND i.recurrence_start_date <= ?
        AND (i.recurrence_end_date IS NULL OR ? <= i.recurrence_end_date)
      FOR UPDATE
      `,
      [today, today]
    );

    let generated = 0;

    for (const tpl of templates) {
      // runDate = the template's "next run date"
      const runDateISO = normalizeISODate(tpl.next_run_iso || tpl.recurrence_start_date);
      if (!runDateISO) continue;

      const nextRunISO = addMonthsClamp(runDateISO, 1);

      // idempotency: skip if already generated for this template + runDate
      const [exists] = await conn.execute(
        `
        SELECT id
        FROM invoice_recurrence_runs
        WHERE template_invoice_id = ? AND run_date = ?
        LIMIT 1
        `,
        [tpl.id, runDateISO]
      );

      const endISO = normalizeISODate(tpl.end_run_iso || tpl.recurrence_end_date);

      const shouldEnd = endISO ? (nextRunISO > endISO) : false;

      // already done → just advance next run
      if (exists.length) {
        await conn.execute(
          `UPDATE invoices
           SET recurrence_start_date = ?, recurrence_status = ?
           WHERE id = ?`,
          [nextRunISO, shouldEnd ? 'ended' : 'active', tpl.id]
        );
        continue;
      }

      // 1) create invoice instance row
      const created = await cloneInvoiceRow(conn, tpl, runDateISO);

      // 2) clone items and recompute totals
      const total = await cloneInvoiceItems(conn, tpl.id, created.id);
      const exchangeRate = Number(tpl.exchange_rate) > 0 ? Number(tpl.exchange_rate) : 1;
      const foreignTotal = Number((total / exchangeRate).toFixed(2));

      await conn.execute(
        `UPDATE invoices SET total_amount_due=?, foreign_total=? WHERE id=?`,
        [total, foreignTotal, created.id]
      );

      // 3) clone tax + footer
      await cloneTaxSummary(conn, tpl.id, created.id);
      await cloneFooter(conn, tpl.id, created.id);

      // 4) record run
      await conn.execute(
        `
        INSERT INTO invoice_recurrence_runs (template_invoice_id, run_date, generated_invoice_id)
        VALUES (?,?,?)
        `,
        [tpl.id, runDateISO, created.id]
      );

      generated++;

      // 5) advance template next run date
      await conn.execute(
        `UPDATE invoices
         SET recurrence_start_date = ?, recurrence_status = ?
         WHERE id = ?`,
        [nextRunISO, shouldEnd ? 'ended' : 'active', tpl.id]
      );
    }

    await conn.commit();
    return { ok: true, today, due_templates: templates.length, generated };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release?.();
  }
}

module.exports = { runMonthlyRecurringInvoices };
