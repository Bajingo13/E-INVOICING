'use strict';

const { getConn } = require('../helpers/db');
const { generateInvoiceNo } = require('../utils/invoiceCounter');
const fetch = require('node-fetch');

const defaultItemCols = ['description', 'quantity', 'unit_price', 'amount', 'account_id'];

// ---------------------- NORMALIZE TAX SUMMARY ----------------------
function normalizeTaxSummary(data) {
  if (!data) return null;
  const raw = data.payment || data.tax_summary || data.taxSummary || {};
  const get = keys => keys.reduce((val, k) => val !== undefined ? val : raw[k], undefined) || 0;

  return {
    subtotal: parseFloat(get(['subtotal'])) || 0,
    discount: parseFloat(get(['discount'])) || 0,
    vatable_sales: parseFloat(get(['vatable_sales', 'vatableSales'])) || 0,
    vat_exempt_sales: parseFloat(get(['vat_exempt_sales', 'vatExemptSales', 'vat_exempt'])) || 0,
    zero_rated_sales: parseFloat(get(['zero_rated_sales', 'zeroRatedSales', 'zero_rated'])) || 0,
    vat_amount: parseFloat(get(['vat_amount', 'vatAmount'])) || 0,
    withholding: parseFloat(get(['withholding', 'withholdingTax'])) || 0,
    total_payable: parseFloat(get(['total_payable', 'totalPayable', 'total'])) || 0
  };
}

// ---------------------- FIXED GET EXCHANGE RATE ----------------------
async function getExchangeRate(currency) {
  currency = (currency || 'PHP').toUpperCase();
  if (currency === 'PHP') return 1;

  const fallbackRates = { USD: 56, SGD: 42, AUD: 38, EUR: 60, PHP: 1 };

  try {
    const BAP_URL = 'https://www.bap.org.ph/downloads/daily-rates.json';
    const res = await fetch(BAP_URL, { timeout: 5000 });
    if (!res.ok) throw new Error('BAP not available');

    const rates = await res.json();
    const rate = parseFloat(rates[currency]);
    if (!rate || rate <= 0) throw new Error('Rate missing from BAP');

    console.log('Exchange rate fetched from BAP:', currency, rate);
    return rate;

  } catch (err) {
    console.warn('BAP fetch failed, using fallback rate for', currency, err.message);
    const fallback = fallbackRates[currency] || 1;
    return fallback;
  }
}

// ---------------------- GET COMPANY INFO ----------------------
async function getCompanyInfo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    if (!rows.length) return res.status(404).json({ message: 'Company info not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error loading company info:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

// ---------------------- CREATE INVOICE ----------------------
async function createInvoice(req, res) {
  const data = req.body;
  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();
  try {
    await conn.beginTransaction();

    // Normalize currency from frontend
    let currency = 'PHP';
    if (data.currency && typeof data.currency === 'string') {
      currency = data.currency.trim().toUpperCase();
    }
    const exchangeRate = await getExchangeRate(currency);

    const invoiceNo = data.invoice_no?.trim() || await generateInvoiceNo(conn);
    const invoiceMode = data.invoice_mode || 'standard';
    const invoiceCategory = data.invoice_category || 'service';
    const invoiceType = data.invoice_type || 'SERVICE INVOICE';

    console.log('Currency:', currency, 'Exchange rate:', exchangeRate);

    // Compute extra columns dynamically
    let extraColumns = [];
    if (Array.isArray(data.extra_columns) && data.extra_columns.length) {
      extraColumns = data.extra_columns;
    } else {
      const extraSet = new Set();
      for (const it of data.items) {
        Object.keys(it || {}).forEach(k => {
          if (!defaultItemCols.includes(k)) extraSet.add(k);
        });
      }
      extraColumns = Array.from(extraSet).map(k => k.replace(/[^a-zA-Z0-9_]/g, ''));
    }

    // Insert invoice
    const [invoiceResult] = await conn.execute(
      `INSERT INTO invoices
        (invoice_no, invoice_mode, invoice_category, invoice_type, bill_to, address, tin, terms, currency, exchange_rate,
         date, due_date, total_amount_due, foreign_total, logo, extra_columns, recurrence_type, recurrence_start_date,
         recurrence_end_date, recurrence_status, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        invoiceMode,
        invoiceCategory,
        invoiceType,
        data.bill_to,
        data.address || null,
        data.tin || null,
        data.terms || null,
        currency,
        exchangeRate,
        data.date,
        data.due_date || null,
        0,
        0,
        data.logo || null,
        JSON.stringify(extraColumns),
        data.recurrence_type || null,
        data.recurrence_start_date || null,
        data.recurrence_end_date || null,
        data.recurrence_type ? 'active' : null,
        data.status || 'draft',
        req.session.user.id
      ]
    );

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
      for (let k of extraKeys) {
        k = k.replace(/[^a-zA-Z0-9_]/g, '');
        if (k && !existingCols.includes(k)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${k}\` VARCHAR(255)`);
          existingCols.push(k);
        }
      }

      const baseCols = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount', 'account_id'];
      const placeholders = ['?', '?', '?', '?', '?', '?'];
      const vals = [invoiceId, item.description || '', quantity, unit_price, itemAmount, item.account_id || null];

      for (let k of extraKeys) {
        if (k) {
          baseCols.push('`' + k + '`');
          placeholders.push('?');
          vals.push(item[k] || null);
        }
      }

      await conn.execute(
        `INSERT INTO invoice_items (${baseCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        vals
      );

      totalAmount += itemAmount;
    }

    const foreignTotal = parseFloat((totalAmount / exchangeRate).toFixed(2));

    await conn.execute(
      'UPDATE invoices SET total_amount_due = ?, foreign_total = ? WHERE id = ?',
      [totalAmount, foreignTotal, invoiceId]
    );

    // ------------------ TAX SUMMARY ------------------
    const normalized = normalizeTaxSummary(data);
    if (normalized) {
      await conn.execute(
        `INSERT INTO invoice_tax_summary
         (invoice_id, subtotal, discount, vatable_sales, vat_exempt_sales, zero_rated_sales, vat_amount, withholding, total_payable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          normalized.subtotal,
          normalized.discount,
          normalized.vatable_sales,
          normalized.vat_exempt_sales,
          normalized.zero_rated_sales,
          normalized.vat_amount,
          normalized.withholding,
          normalized.total_payable
        ]
      );
    }

    // ------------------ FOOTER ------------------
    if (data.footer) {
      const f = data.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]
      );
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      invoiceId,
      invoiceNo,
      total_amount_due: totalAmount,
      foreign_total: foreignTotal,
      invoice_mode: invoiceMode,
      invoice_category: invoiceCategory,
      invoice_type: invoiceType,
      currency,
      exchange_rate: exchangeRate
    });

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Failed to create invoice', details: err.message });
  } finally {
    conn.release();
  }
}

// ---------------------- UPDATE INVOICE ----------------------
async function updateInvoice(req, res) {
  const invoiceNo = req.params.invoiceNo;
  const data = req.body;
  const conn = await getConn();

  if (!data.bill_to || !data.date || !Array.isArray(data.items) || !data.items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute('SELECT id, currency FROM invoices WHERE invoice_no = ? LIMIT 1', [invoiceNo]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Invoice not found' }); }

    const invoiceId = rows[0].id;

    // Normalize currency from frontend
    let currency = rows[0].currency || 'PHP';
    if (data.currency && typeof data.currency === 'string') {
      currency = data.currency.trim().toUpperCase();
    }
    const exchangeRate = await getExchangeRate(currency);

    const invoiceMode = data.invoice_mode || 'standard';
    const invoiceCategory = data.invoice_category || 'service';
    const invoiceType = data.invoice_type || 'SERVICE INVOICE';

    // Delete old items, tax summary, footer
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_tax_summary WHERE invoice_id = ?', [invoiceId]);
    await conn.execute('DELETE FROM invoice_footer WHERE invoice_id = ?', [invoiceId]);

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
      for (let k of extraKeys) {
        k = k.replace(/[^a-zA-Z0-9_]/g, '');
        if (k && !existingCols.includes(k)) {
          await conn.execute(`ALTER TABLE invoice_items ADD COLUMN \`${k}\` VARCHAR(255)`);
          existingCols.push(k);
        }
      }

      const baseCols = ['invoice_id', 'description', 'quantity', 'unit_price', 'amount', 'account_id'];
      const placeholders = ['?', '?', '?', '?', '?', '?'];
      const vals = [invoiceId, item.description || '', quantity, unit_price, itemAmount, item.account_id || null];

      for (let k of extraKeys) {
        if (k) {
          baseCols.push('`' + k + '`');
          placeholders.push('?');
          vals.push(item[k] || null);
        }
      }

      await conn.execute(
        `INSERT INTO invoice_items (${baseCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        vals
      );

      totalAmount += itemAmount;
    }

    const foreignTotal = parseFloat((totalAmount / exchangeRate).toFixed(2));

    await conn.execute(
      `UPDATE invoices
       SET invoice_mode=?, invoice_category=?, invoice_type=?, bill_to=?, address=?, tin=?, terms=?, date=?,
           total_amount_due=?, foreign_total=?, logo=?, extra_columns=?, status=?, currency=?, exchange_rate=?
       WHERE id=?`,
      [
        invoiceMode,
        invoiceCategory,
        invoiceType,
        data.bill_to,
        data.address || null,
        data.tin || null,
        data.terms || null,
        data.date,
        totalAmount,
        foreignTotal,
        data.logo || null,
        JSON.stringify(data.extra_columns || []),
        data.status || 'draft',
        currency,
        exchangeRate,
        invoiceId
      ]
    );

    const normalized = normalizeTaxSummary(data);
    if (normalized) {
      await conn.execute(
        `INSERT INTO invoice_tax_summary
         (invoice_id, subtotal, discount, vatable_sales, vat_exempt_sales, zero_rated_sales, vat_amount, withholding, total_payable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          normalized.subtotal,
          normalized.discount,
          normalized.vatable_sales,
          normalized.vat_exempt_sales,
          normalized.zero_rated_sales,
          normalized.vat_amount,
          normalized.withholding,
          normalized.total_payable
        ]
      );
    }

    if (data.footer) {
      const f = data.footer;
      await conn.execute(
        `INSERT INTO invoice_footer (invoice_id, atp_no, atp_date, bir_permit_no, bir_date, serial_nos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, f.atp_no || null, f.atp_date || null, f.bir_permit_no || null, f.bir_date || null, f.serial_nos || null]
      );
    }

    await conn.commit();

    res.json({
      success: true,
      invoiceId,
      total_amount_due: totalAmount,
      foreign_total: foreignTotal,
      invoice_mode: invoiceMode,
      invoice_category: invoiceCategory,
      invoice_type: invoiceType,
      currency,
      exchange_rate: exchangeRate
    });

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Failed to update invoice', details: err.message });
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
    const rawTax = taxRows[0] || {};
    const tax_summary = {
      vatable_sales: rawTax.vatable_sales || 0,
      vat_amount: rawTax.vat_amount || 0,
      vat_exempt_sales: rawTax.vat_exempt_sales || 0,
      zero_rated_sales: rawTax.zero_rated_sales || 0,
      subtotal: rawTax.subtotal || 0,
      discount: rawTax.discount || 0,
      withholding: rawTax.withholding || 0,
      total_payable: rawTax.total_payable || 0
    };

    const [footers] = await conn.execute('SELECT * FROM invoice_footer WHERE invoice_id = ? LIMIT 1', [invoice.id]);
    const [companyRows] = await conn.execute('SELECT * FROM company_info LIMIT 1');

    invoice.items = items;
    invoice.tax_summary = tax_summary;
    invoice.footer = footers[0] || {};
    invoice.company = companyRows[0] || {};
    invoice.extra_columns = invoice.extra_columns ? JSON.parse(invoice.extra_columns) : [];

    res.json(invoice);
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ error: 'Failed to fetch invoice', details: err.message });
  } finally {
    conn.release();
  }
}

// ---------------------- LIST INVOICES ----------------------
async function listInvoices(req, res) {
  const conn = await getConn();
  try {
    const { status } = req.query;
    let sql = `SELECT i.id, i.invoice_no, i.bill_to, i.date AS invoice_date, i.total_amount_due, i.foreign_total,
                      i.logo, i.status, i.invoice_mode, i.invoice_category, i.invoice_type, i.currency, i.exchange_rate
               FROM invoices i`;
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

// ---------------------- NEXT INVOICE NO (preview only) ----------------------
async function nextInvoiceNo(req, res) {
  const conn = await getConn();
  try {
    const [counterRows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    if (!counterRows.length) throw new Error('Invoice counter not initialized');
    const counter = counterRows[0];

    const [maxRows] = await conn.execute(
      `SELECT MAX(CAST(SUBSTRING(invoice_no, ?) AS UNSIGNED)) AS max_no FROM invoices`,
      [counter.prefix.length + 1]
    );
    const maxInvoice = maxRows[0].max_no || 0;
    const nextNumber = Math.max(counter.last_number || 0, maxInvoice) + 1;
    const invoiceNo = `${counter.prefix}${String(nextNumber).padStart(6, '0')}`;

    res.json({ invoiceNo });
  } catch (err) {
    console.error('Next invoice number preview error:', err);
    res.status(500).json({ error: 'Failed to get next invoice number', details: err.message });
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
  getCompanyInfo,
  getExchangeRate,
  normalizeTaxSummary
};
