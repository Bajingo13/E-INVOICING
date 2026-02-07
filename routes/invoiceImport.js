'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getConn } = require('../helpers/db');

const upload = multer({ dest: 'uploads/' });

// ===== 1️⃣ UPLOAD & PARSE EXCEL =====
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);

    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'No worksheet found' });

    const rows = [];
    const headers = sheet.getRow(1).values.slice(1).map(h => h?.toString().trim());
    const colIndex = {};
    headers.forEach((h, i) => colIndex[h] = i + 1);

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header

      rows.push({
        SA_NO: row.getCell(colIndex['SA_NO']).value,
        DATE: row.getCell(colIndex['DATE']).value,
        PERNAME: row.getCell(colIndex['PERNAME']).value,
        STATUS: row.getCell(colIndex['STATUS']).value,
        TERMS: row.getCell(colIndex['TERMS']).value,
        VOUCH_AMT: row.getCell(colIndex['VOUCH_AMT']).value,
        BASEDRATE: row.getCell(colIndex['BASEDRATE']).value,
        AR_CODE: row.getCell(colIndex['AR_CODE']).value,
        SALES_CD: row.getCell(colIndex['SALES_CD']).value,
        PARTIC: row.getCell(colIndex['PARTIC']).value,
        OUTPUTVAT: row.getCell(colIndex['OUTPUTVAT']).value
      });
    });

    fs.unlinkSync(req.file.path);
    res.json({ preview: rows.slice(0, 50), total_rows: rows.length });
  } catch (err) {
    console.error('Invoice import parse failed:', err);
    res.status(500).json({ error: 'Failed to parse Excel file' });
  }
});

// ===== 2️⃣ SAVE PARSED DATA TO DB =====
router.post('/save', async (req, res) => {
  const data = req.body;
  if (!Array.isArray(data) || !data.length)
    return res.status(400).json({ error: 'No data to save' });

  // Get logged-in user ID from session
  const createdBy = req.session?.user?.id;
  if (!createdBy) return res.status(401).json({ error: 'Unauthorized: no user session' });

  const conn = await getConn();

  try {
    await conn.beginTransaction();
    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of data) {
      // Skip rows missing essential fields
      if (!row.SA_NO || !row.DATE || !row.PERNAME) { skippedCount++; continue; }

      // Convert Excel date to MySQL YYYY-MM-DD
      let mysqlDate;
      if (row.DATE instanceof Date) {
        mysqlDate = row.DATE.toISOString().slice(0, 10);
      } else {
        mysqlDate = row.DATE?.toString().slice(0, 10) || null;
      }

      // Check if invoice exists
      const [[existing]] = await conn.execute(
        'SELECT id FROM invoices WHERE invoice_no = ?',
        [row.SA_NO]
      );

      let invoiceId;
      if (existing) {
        invoiceId = existing.id;
        await conn.execute(
          `UPDATE invoices
           SET date=?, bill_to=?, status=?, terms=?, created_by=?
           WHERE id=?`,
          [mysqlDate, row.PERNAME, row.STATUS || 'draft', row.TERMS || '', createdBy, invoiceId]
        );
      } else {
        const [result] = await conn.execute(
          `INSERT INTO invoices
           (invoice_no, date, bill_to, status, terms, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.SA_NO, mysqlDate, row.PERNAME, row.STATUS || 'draft', row.TERMS || '', createdBy]
        );
        invoiceId = result.insertId;
        insertedCount++;
      }

      // Insert invoice item (ignore missing optional fields)
      await conn.execute(
        `INSERT INTO invoice_items
         (invoice_id, account_id, description, amount)
         VALUES (?, ?, ?, ?)`,
        [
          invoiceId,
          row.AR_CODE || null,
          row.PARTIC || '',
          row.BASEDRATE || 0
        ]
      );

      // Insert tax summary
      await conn.execute(
        `INSERT INTO invoice_tax_summary
         (invoice_id, total_payable, vatable_sales, vat_amount)
         VALUES (?, ?, ?, ?)`,
        [
          invoiceId,
          row.VOUCH_AMT || 0,
          row.BASEDRATE || 0,
          row.OUTPUTVAT || 0
        ]
      );
    }

    await conn.commit();
    res.json({ ok: true, inserted: insertedCount, skipped: skippedCount, total: data.length });

  } catch (err) {
    await conn.rollback();
    console.error('Invoice import save failed:', err);
    res.status(500).json({ error: 'Failed to save invoices' });
  } finally {
    conn.release();
  }
});

module.exports = router;
