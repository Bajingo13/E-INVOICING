'use strict';

const { pool, getConn } = require('../helpers/db');
const express = require('express');
const router = express.Router();

// GET /api/reports/sales
router.get('/sales', async (req, res) => {
  const { from, to, customer } = req.query;

  try {
    const conn = await getConn();
    let sql = `
      SELECT 
        date AS invoice_date,
        invoice_no,
        bill_to AS customer,
        tin,
        total_amount_due AS gross_amount,
        COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = invoices.id), 0) AS net_amount,
        COALESCE((SELECT vat_amount FROM invoice_tax_summary WHERE invoice_id = invoices.id), 0) AS vat_amount
      FROM invoices
      WHERE 1
    `;
    const params = [];

    if (from) {
      sql += ' AND date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND date <= ?';
      params.push(to);
    }
    if (customer) {
      sql += ' AND bill_to LIKE ?';
      params.push(`%${customer}%`);
    }

    sql += ' ORDER BY date DESC';

    const [rows] = await conn.execute(sql, params);
    conn.release();

    res.json(rows);
  } catch (err) {
    console.error('Sales fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', details: err.message });
  }
});

// ---------------- GET /api/reports/sales/excel ----------------
router.get('/sales/excel', async (req, res) => {
  try {
    const { from, to, customer } = req.query;

    let query = `
      SELECT invoice_date, invoice_no, customer_name AS customer, tin, net_amount, vat_amount, gross_amount
      FROM invoices
      WHERE 1
    `;
    const params = [];

    if (from) {
      query += ' AND invoice_date >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND invoice_date <= ?';
      params.push(to);
    }
    if (customer) {
      query += ' AND customer_name LIKE ?';
      params.push(`%${customer}%`);
    }

    const [rows] = await pool.query(query, params);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');

    sheet.columns = [
      { header: 'Date', key: 'invoice_date', width: 15 },
      { header: 'Invoice No', key: 'invoice_no', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'TIN', key: 'tin', width: 15 },
      { header: 'Net Sales', key: 'net_amount', width: 15 },
      { header: 'VAT', key: 'vat_amount', width: 15 },
      { header: 'Gross', key: 'gross_amount', width: 15 }
    ];

    rows.forEach(row => sheet.addRow(row));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Sales_Report.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('❌ Excel export error:', err);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

// -------------------- INPUT VAT --------------------
router.get('/input-vat', async (req, res) => {
  const { from, to } = req.query;

  try {
    const [rows] = await pool.query(
      `SELECT 
         i.date AS invoice_date,
         i.invoice_no,
         i.bill_to AS supplier,      -- FIXED: use bill_to instead of supplier_name
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT vat_amount FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
         i.total_amount_due AS gross_amount
       FROM invoices i
       WHERE 1
         ${from ? ' AND i.date >= ?' : ''}
         ${to ? ' AND i.date <= ?' : ''}
       ORDER BY i.date DESC`,
      from && to ? [from, to] : from ? [from] : to ? [to] : []
    );

    res.json(rows);
  } catch (err) {
    console.error('Input VAT fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch input VAT', details: err.message });
  }
});

router.get('/input-vat/excel', async (req, res) => {
  const { from, to } = req.query;

  try {
    const [rows] = await pool.query(
      `SELECT 
         i.date AS invoice_date,
         i.invoice_no,
         i.bill_to AS supplier,      -- FIXED: use bill_to instead of supplier_name
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT vat_amount FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
         i.total_amount_due AS gross_amount
       FROM invoices i
       WHERE 1
         ${from ? ' AND i.date >= ?' : ''}
         ${to ? ' AND i.date <= ?' : ''}
       ORDER BY i.date DESC`,
      from && to ? [from, to] : from ? [from] : to ? [to] : []
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Input VAT');
    sheet.columns = [
      { header: 'Date', key: 'invoice_date', width: 15 },
      { header: 'Invoice No', key: 'invoice_no', width: 15 },
      { header: 'Supplier', key: 'supplier', width: 25 },
      { header: 'TIN', key: 'tin', width: 15 },
      { header: 'Net Amount', key: 'net_amount', width: 15 },
      { header: 'VAT', key: 'vat_amount', width: 15 },
      { header: 'Gross Amount', key: 'gross_amount', width: 15 },
    ];

    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Input_VAT.xlsx"'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Input VAT Excel error:', err);
    res.status(500).json({ error: 'Failed to export Input VAT Excel', details: err.message });
  }
});

// -------------------- OUTPUT VAT --------------------
router.get('/output-vat', async (req, res) => {
  const { from, to } = req.query;

  try {
    const [rows] = await pool.query(
      `SELECT 
         i.date AS invoice_date,
         i.invoice_no,
         i.bill_to AS customer,
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT vat_amount FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
         i.total_amount_due AS gross_amount
       FROM invoices i
       WHERE 1
         ${from ? ' AND i.date >= ?' : ''}
         ${to ? ' AND i.date <= ?' : ''}
       ORDER BY i.date DESC`,
      from && to ? [from, to] : from ? [from] : to ? [to] : []
    );

    res.json(rows);
  } catch (err) {
    console.error('Output VAT fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch output VAT', details: err.message });
  }
});

router.get('/output-vat/excel', async (req, res) => {
  const { from, to } = req.query;

  try {
    const [rows] = await pool.query(
      `SELECT 
         i.date AS invoice_date,
         i.invoice_no,
         i.bill_to AS customer,
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT vat_amount FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
         i.total_amount_due AS gross_amount
       FROM invoices i
       WHERE 1
         ${from ? ' AND i.date >= ?' : ''}
         ${to ? ' AND i.date <= ?' : ''}
       ORDER BY i.date DESC`,
      from && to ? [from, to] : from ? [from] : to ? [to] : []
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Output VAT');
    sheet.columns = [
      { header: 'Date', key: 'invoice_date', width: 15 },
      { header: 'Invoice No', key: 'invoice_no', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'TIN', key: 'tin', width: 15 },
      { header: 'Net Amount', key: 'net_amount', width: 15 },
      { header: 'VAT', key: 'vat_amount', width: 15 },
      { header: 'Gross Amount', key: 'gross_amount', width: 15 },
    ];
    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Output_VAT.xlsx"'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Output VAT Excel error:', err);
    res.status(500).json({ error: 'Failed to export Output VAT Excel', details: err.message });
  }
});


module.exports = router;
