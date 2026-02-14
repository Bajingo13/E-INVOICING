'use strict';

const { pool, getConn } = require('../helpers/db');
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');

/* =========================================================
   SALES REPORT
   - ONLY pending + approved invoices
   - JOIN + GROUP BY (no subquery multi-row issues)
========================================================= */

// GET /api/reports/sales
router.get('/sales', async (req, res) => {
  const { from, to, customer } = req.query;

  let conn;
  try {
    conn = await getConn();

    let sql = `
      SELECT 
        i.date AS invoice_date,
        i.invoice_no,
        i.bill_to AS customer,
        i.tin,
        i.total_amount_due AS gross_amount,
        COALESCE(SUM(ii.amount), 0) AS net_amount,
        COALESCE(SUM(its.vat_amount), 0) AS vat_amount
      FROM invoices i
      LEFT JOIN invoice_items ii
        ON ii.invoice_id = i.id
      LEFT JOIN invoice_tax_summary its
        ON its.invoice_id = i.id
      WHERE i.status IN ('pending', 'approved')
    `;

    const params = [];

    if (from) { sql += ' AND i.date >= ?'; params.push(from); }
    if (to) { sql += ' AND i.date <= ?'; params.push(to); }
    if (customer) { sql += ' AND i.bill_to LIKE ?'; params.push(`%${customer}%`); }

    sql += `
      GROUP BY i.id
      ORDER BY i.date DESC
    `;

    const [rows] = await conn.execute(sql, params);
    res.json(rows);

  } catch (err) {
    console.error('Sales fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/reports/sales/excel
router.get('/sales/excel', async (req, res) => {
  const { from, to, customer } = req.query;

  let conn;
  try {
    conn = await getConn();

    // 1) Company Info
    const [[company]] = await conn.execute(
      `SELECT company_name, company_address, vat_tin
       FROM company_info
       LIMIT 1`
    );

    // 2) Data
    let sql = `
      SELECT 
        i.date AS invoice_date,
        i.invoice_no,
        i.bill_to AS customer,
        i.tin,
        COALESCE(SUM(ii.amount), 0) AS net_amount,
        COALESCE(SUM(its.vat_amount), 0) AS vat_amount,
        i.total_amount_due AS gross_amount
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN invoice_tax_summary its ON its.invoice_id = i.id
      WHERE i.status IN ('pending', 'approved')
    `;
    const params = [];

    if (from) { sql += ' AND i.date >= ?'; params.push(from); }
    if (to) { sql += ' AND i.date <= ?'; params.push(to); }
    if (customer) { sql += ' AND i.bill_to LIKE ?'; params.push(`%${customer}%`); }

    sql += `
      GROUP BY i.id
      ORDER BY i.date DESC
    `;

    const [rows] = await conn.execute(sql, params);

    // 3) Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AstreaBlue E-Invoicing';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Report', {
      views: [{ showGridLines: false }]
    });

    sheet.columns = [
      { header: 'Date', key: 'invoice_date', width: 14 },
      { header: 'Invoice No', key: 'invoice_no', width: 16 },
      { header: 'Customer', key: 'customer', width: 32 },
      { header: 'TIN', key: 'tin', width: 20 },
      { header: 'Net Sales', key: 'net_amount', width: 14 },
      { header: 'VAT', key: 'vat_amount', width: 12 },
      { header: 'Gross', key: 'gross_amount', width: 14 }
    ];

    const lastCol = 'G';
    let r = 1;

    const mergeRow = (row, value, style = {}) => {
      sheet.mergeCells(`A${row}:${lastCol}${row}`);
      const cell = sheet.getCell(`A${row}`);
      cell.value = value;
      Object.assign(cell, style);
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };

    mergeRow(r++, company?.company_name || 'Company Name', {
      font: { bold: true, size: 16 },
      alignment: { vertical: 'middle' }
    });

    mergeRow(r++, company?.company_address || '', {
      font: { size: 11, color: { argb: 'FF374151' } },
      alignment: { vertical: 'middle', wrapText: true }
    });

    mergeRow(r++, `VAT TIN: ${company?.vat_tin || ''}`, {
      font: { size: 11, color: { argb: 'FF374151' } }
    });

    r++;

    mergeRow(r++, 'SALES REPORT', {
      font: { bold: true, size: 13 },
      alignment: { horizontal: 'center', vertical: 'middle' }
    });

    const periodText =
      (from || to)
        ? `Period: ${from || 'Beginning'} to ${to || 'Present'}`
        : 'Period: All Dates';

    mergeRow(r++, periodText, {
      font: { size: 11, color: { argb: 'FF4B5563' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    });

    r++;

    const headerRowIndex = r;
    const headerRow = sheet.getRow(r);
    headerRow.values = sheet.columns.map(c => c.header);
    headerRow.height = 20;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E54C8' } };
      cell.border = thinBorder;
    });

    r++;

    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: 7 }
    };

    rows.forEach((x, idx) => {
      const row = sheet.getRow(r + idx);

      row.getCell(1).value = x.invoice_date ? new Date(x.invoice_date) : null;
      row.getCell(2).value = x.invoice_no || '';
      row.getCell(3).value = x.customer || '';
      row.getCell(4).value = x.tin ? String(x.tin) : '';
      row.getCell(5).value = Number(x.net_amount || 0);
      row.getCell(6).value = Number(x.vat_amount || 0);
      row.getCell(7).value = Number(x.gross_amount || 0);

      row.getCell(1).numFmt = 'mm/dd/yyyy';
      row.getCell(4).numFmt = '@';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';

      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).alignment = { horizontal: 'right' };

      const isEven = idx % 2 === 1;
      row.eachCell((cell) => {
        cell.border = thinBorder;
        cell.alignment = cell.alignment || { vertical: 'middle' };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });

    const dataStart = headerRowIndex + 1;
    const dataEnd = headerRowIndex + rows.length;

    const totalRowIndex = dataEnd + 1;
    const totalRow = sheet.getRow(totalRowIndex);

    totalRow.getCell(1).value = 'TOTAL';
    totalRow.getCell(1).font = { bold: true };
    sheet.mergeCells(`A${totalRowIndex}:D${totalRowIndex}`);

    totalRow.getCell(5).value = { formula: `SUM(E${dataStart}:E${dataEnd})` };
    totalRow.getCell(6).value = { formula: `SUM(F${dataStart}:F${dataEnd})` };
    totalRow.getCell(7).value = { formula: `SUM(G${dataStart}:G${dataEnd})` };

    [5, 6, 7].forEach(c => {
      const cell = totalRow.getCell(c);
      cell.numFmt = '#,##0.00';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'right' };
    });

    totalRow.eachCell((cell) => {
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });

    sheet.getRow(1).height = 24;
    sheet.getRow(2).height = 30;

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
    res.status(500).json({ error: 'Failed to export Excel', details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

/* =========================================================
   SALES TAX SUMMARY (NEW)
   - ONLY pending + approved invoices
   - group=month | customer  (default month)
   - Uses your current data sources:
       net = SUM(invoice_items.amount)
       vat = SUM(invoice_tax_summary.vat_amount)
       gross = SUM(invoices.total_amount_due)
========================================================= */

// GET /api/reports/sales-tax-summary
router.get('/sales-tax-summary', async (req, res) => {
  const { from, to, customer } = req.query;
  const group = String(req.query.group || 'month').toLowerCase(); // month | customer

  let conn;
  try {
    conn = await getConn();

    // NOTE:
    // - vatable_sales is treated as net_amount (sum of items)
    // - exempt/zero are 0 unless you track them explicitly in your DB
    let sql = `
      SELECT
        ${group === 'customer' ? `'—'` : `DATE_FORMAT(i.date, '%Y-%m')`} AS period,
        i.bill_to AS customer,
        i.tin AS tin,
        COALESCE(SUM(ii.amount), 0) AS vatable_sales,
        0 AS vat_exempt_sales,
        0 AS zero_rated_sales,
        COALESCE(SUM(its.vat_amount), 0) AS output_vat,
        COALESCE(SUM(i.total_amount_due), 0) AS gross_sales,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoices i
      LEFT JOIN invoice_items ii
        ON ii.invoice_id = i.id
      LEFT JOIN invoice_tax_summary its
        ON its.invoice_id = i.id
      WHERE i.status IN ('pending', 'approved')
    `;

    const params = [];

    if (from) { sql += ' AND i.date >= ?'; params.push(from); }
    if (to) { sql += ' AND i.date <= ?'; params.push(to); }
    if (customer) { sql += ' AND i.bill_to LIKE ?'; params.push(`%${customer}%`); }

    sql += `
      GROUP BY
        ${group === 'customer' ? `i.bill_to, i.tin` : `period, i.bill_to, i.tin`}
      ORDER BY
        ${group === 'customer' ? `i.bill_to ASC` : `period DESC, i.bill_to ASC`}
    `;

    const [rows] = await conn.execute(sql, params);
    res.json(rows);

  } catch (err) {
    console.error('Sales Tax Summary fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sales tax summary', details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/reports/sales-tax-summary/excel
router.get('/sales-tax-summary/excel', async (req, res) => {
  const { from, to, customer } = req.query;
  const group = String(req.query.group || 'month').toLowerCase(); // month | customer

  let conn;
  try {
    conn = await getConn();

    // 1) Company Info
    const [[company]] = await conn.execute(
      `SELECT company_name, company_address, vat_tin
       FROM company_info
       LIMIT 1`
    );

    // 2) Data
    let sql = `
      SELECT
        ${group === 'customer' ? `'—'` : `DATE_FORMAT(i.date, '%Y-%m')`} AS period,
        i.bill_to AS customer,
        i.tin AS tin,
        COALESCE(SUM(ii.amount), 0) AS vatable_sales,
        0 AS vat_exempt_sales,
        0 AS zero_rated_sales,
        COALESCE(SUM(its.vat_amount), 0) AS output_vat,
        COALESCE(SUM(i.total_amount_due), 0) AS gross_sales,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN invoice_tax_summary its ON its.invoice_id = i.id
      WHERE i.status IN ('pending', 'approved')
    `;

    const params = [];
    if (from) { sql += ' AND i.date >= ?'; params.push(from); }
    if (to) { sql += ' AND i.date <= ?'; params.push(to); }
    if (customer) { sql += ' AND i.bill_to LIKE ?'; params.push(`%${customer}%`); }

    sql += `
      GROUP BY
        ${group === 'customer' ? `i.bill_to, i.tin` : `period, i.bill_to, i.tin`}
      ORDER BY
        ${group === 'customer' ? `i.bill_to ASC` : `period DESC, i.bill_to ASC`}
    `;

    const [rows] = await conn.execute(sql, params);

    // 3) Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AstreaBlue E-Invoicing';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Tax Summary', {
      views: [{ showGridLines: false }]
    });

    // Columns
    sheet.columns = [
      { header: 'Period', key: 'period', width: 12 },
      { header: 'Customer', key: 'customer', width: 32 },
      { header: 'TIN', key: 'tin', width: 20 },
      { header: 'VATable Sales', key: 'vatable_sales', width: 16 },
      { header: 'VAT Exempt', key: 'vat_exempt_sales', width: 14 },
      { header: 'Zero-Rated', key: 'zero_rated_sales', width: 14 },
      { header: 'Output VAT', key: 'output_vat', width: 14 },
      { header: 'Gross Sales', key: 'gross_sales', width: 16 },
      { header: 'Invoices', key: 'invoice_count', width: 10 }
    ];

    const lastCol = 'I';
    let r = 1;

    const mergeRow = (row, value, style = {}) => {
      sheet.mergeCells(`A${row}:${lastCol}${row}`);
      const cell = sheet.getCell(`A${row}`);
      cell.value = value;
      Object.assign(cell, style);
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };

    // ---- Header block ----
    mergeRow(r++, company?.company_name || 'Company Name', {
      font: { bold: true, size: 16 },
      alignment: { vertical: 'middle' }
    });

    mergeRow(r++, company?.company_address || '', {
      font: { size: 11, color: { argb: 'FF374151' } },
      alignment: { vertical: 'middle', wrapText: true }
    });

    mergeRow(r++, `VAT TIN: ${company?.vat_tin || ''}`, {
      font: { size: 11, color: { argb: 'FF374151' } }
    });

    r++;

    mergeRow(r++, 'SALES TAX SUMMARY', {
      font: { bold: true, size: 13 },
      alignment: { horizontal: 'center', vertical: 'middle' }
    });

    const periodText =
      (from || to)
        ? `Period: ${from || 'Beginning'} to ${to || 'Present'}`
        : 'Period: All Dates';

    mergeRow(r++, `Group: ${group.toUpperCase()} • ${periodText}`, {
      font: { size: 11, color: { argb: 'FF4B5563' } },
      alignment: { horizontal: 'center', vertical: 'middle' }
    });

    r++;

    // ---- Table header row ----
    const headerRowIndex = r;
    const headerRow = sheet.getRow(r);
    headerRow.values = sheet.columns.map(c => c.header);
    headerRow.height = 20;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E54C8' } };
      cell.border = thinBorder;
    });

    r++;

    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: 9 }
    };

    // ---- Data rows ----
    rows.forEach((x, idx) => {
      const row = sheet.getRow(r + idx);

      row.getCell(1).value = x.period || '';
      row.getCell(2).value = x.customer || '';
      row.getCell(3).value = x.tin ? String(x.tin) : '';
      row.getCell(4).value = Number(x.vatable_sales || 0);
      row.getCell(5).value = Number(x.vat_exempt_sales || 0);
      row.getCell(6).value = Number(x.zero_rated_sales || 0);
      row.getCell(7).value = Number(x.output_vat || 0);
      row.getCell(8).value = Number(x.gross_sales || 0);
      row.getCell(9).value = Number(x.invoice_count || 0);

      row.getCell(3).numFmt = '@';
      [4,5,6,7,8].forEach(c => row.getCell(c).numFmt = '#,##0.00');

      [4,5,6,7,8,9].forEach(c => {
        row.getCell(c).alignment = { horizontal: 'right' };
      });

      const isEven = idx % 2 === 1;
      row.eachCell((cell) => {
        cell.border = thinBorder;
        cell.alignment = cell.alignment || { vertical: 'middle' };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });

    const dataStart = headerRowIndex + 1;
    const dataEnd = headerRowIndex + rows.length;

    // ---- Totals row ----
    const totalRowIndex = dataEnd + 1;
    const totalRow = sheet.getRow(totalRowIndex);

    totalRow.getCell(1).value = 'TOTAL';
    totalRow.getCell(1).font = { bold: true };
    sheet.mergeCells(`A${totalRowIndex}:C${totalRowIndex}`);

    totalRow.getCell(4).value = { formula: `SUM(D${dataStart}:D${dataEnd})` };
    totalRow.getCell(5).value = { formula: `SUM(E${dataStart}:E${dataEnd})` };
    totalRow.getCell(6).value = { formula: `SUM(F${dataStart}:F${dataEnd})` };
    totalRow.getCell(7).value = { formula: `SUM(G${dataStart}:G${dataEnd})` };
    totalRow.getCell(8).value = { formula: `SUM(H${dataStart}:H${dataEnd})` };
    totalRow.getCell(9).value = { formula: `SUM(I${dataStart}:I${dataEnd})` };

    [4,5,6,7,8].forEach(c => {
      const cell = totalRow.getCell(c);
      cell.numFmt = '#,##0.00';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'right' };
    });

    const invCell = totalRow.getCell(9);
    invCell.font = { bold: true };
    invCell.alignment = { horizontal: 'right' };

    totalRow.eachCell((cell) => {
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });

    // Response
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Sales_Tax_Summary.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('❌ Sales Tax Summary Excel export error:', err);
    res.status(500).json({ error: 'Failed to export Sales Tax Summary Excel', details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

/* =========================================================
   INPUT VAT
   - (kept your structure, but fixed VAT to SUM)
========================================================= */

router.get('/input-vat', async (req, res) => {
  const { from, to } = req.query;

  try {
    const [rows] = await pool.query(
      `SELECT 
         i.date AS invoice_date,
         i.invoice_no,
         i.bill_to AS supplier,
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT SUM(vat_amount) FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
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
         i.bill_to AS supplier,
         i.tin,
         COALESCE((SELECT SUM(amount) FROM invoice_items WHERE invoice_id = i.id), 0) AS net_amount,
         COALESCE((SELECT SUM(vat_amount) FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
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
      { header: 'Supplier', key: 'supplier', width: 30 },
      { header: 'TIN', key: 'tin', width: 18 },
      { header: 'Net Amount', key: 'net_amount', width: 15 },
      { header: 'VAT', key: 'vat_amount', width: 15 },
      { header: 'Gross Amount', key: 'gross_amount', width: 15 },
    ];

    rows.forEach(r => sheet.addRow(r));

    sheet.getColumn('net_amount').numFmt = '#,##0.00';
    sheet.getColumn('vat_amount').numFmt = '#,##0.00';
    sheet.getColumn('gross_amount').numFmt = '#,##0.00';

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

/* =========================================================
   OUTPUT VAT
   - (kept your structure, but fixed VAT to SUM)
========================================================= */

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
         COALESCE((SELECT SUM(vat_amount) FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
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
         COALESCE((SELECT SUM(vat_amount) FROM invoice_tax_summary WHERE invoice_id = i.id), 0) AS vat_amount,
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
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'TIN', key: 'tin', width: 18 },
      { header: 'Net Amount', key: 'net_amount', width: 15 },
      { header: 'VAT', key: 'vat_amount', width: 15 },
      { header: 'Gross Amount', key: 'gross_amount', width: 15 },
    ];

    rows.forEach(r => sheet.addRow(r));

    sheet.getColumn('net_amount').numFmt = '#,##0.00';
    sheet.getColumn('vat_amount').numFmt = '#,##0.00';
    sheet.getColumn('gross_amount').numFmt = '#,##0.00';

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
