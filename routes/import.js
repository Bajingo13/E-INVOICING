// routes/import.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getConn } = require('../db');

const upload = multer({ dest: 'uploads/' });

/* =========================================================
   NORMALIZE EXCEL ROW
========================================================= */
function normalizeRow(row) {
  let dateVal = null;

  if (row.date instanceof Date) {
    dateVal = row.date.toISOString().split('T')[0];
  } else if (typeof row.date === 'string' && row.date.trim() !== '') {
    const d = new Date(row.date);
    dateVal = isNaN(d.getTime())
      ? null
      : d.toISOString().split('T')[0];
  }

  // 🔐 SAFE DEFAULT DATE (prevents NULL)
  const safeDate = dateVal || new Date().toISOString().slice(0, 10);

  const obj = {
    code: row.acct_cd != null ? String(row.acct_cd).trim() : '',
    title: row.acct_title != null ? String(row.acct_title).trim() : '',
    class_type: row.acct_type != null ? String(row.acct_type).trim() : '',
    tax_rate: row.tax_rate != null ? Number(row.tax_rate) : 0,
    date: safeDate
  };

  const errors = [];
  if (!obj.code) errors.push('code missing');
  if (!obj.title) errors.push('title missing');
  if (!obj.class_type) errors.push('class_type missing');
  if (!row.date) errors.push('date missing (defaulted to today)');

  return { obj, errors };
}

/* =========================================================
   PARSE EXCEL BUFFER
========================================================= */
async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  const rows = [];

  // --- Read headers ---
  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values
    .slice(1)
    .map(h => (h ? h.toString().trim().toLowerCase() : null));

  const colMap = {};
  headers.forEach((h, idx) => {
    if (h) colMap[h] = idx + 1;
  });

  // --- Read data rows ---
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.actualCellCount === 0) return;

    const rowObj = {
      acct_cd: colMap['acct_cd'] ? row.getCell(colMap['acct_cd']).value : null,
      acct_title: colMap['acct_title'] ? row.getCell(colMap['acct_title']).value : null,
      acct_type: colMap['acct_type'] ? row.getCell(colMap['acct_type']).value : null,
      tax_rate: colMap['tax_rate'] ? row.getCell(colMap['tax_rate']).value : 0,
      date: colMap['date'] ? row.getCell(colMap['date']).value : null
    };

    rows.push(normalizeRow(rowObj));
  });

  return rows;
}

/* =========================================================
   UPLOAD & PREVIEW
========================================================= */
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const buf = fs.readFileSync(req.file.path);

  try {
    const mapped = await parseExcelBuffer(buf);

    const preview = mapped.map(m => m.obj);
    const errors = mapped
      .map((m, i) => ({ row: i + 2, errors: m.errors }))
      .filter(e => e.errors.length);

    fs.unlinkSync(req.file.path);
    res.json({ preview, errors });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse Excel' });
  }
});

/* =========================================================
   SAVE TO DATABASE
========================================================= */
router.post('/save', async (req, res) => {
  const data = req.body;

  if (!Array.isArray(data) || !data.length) {
    return res.status(400).json({ error: 'No data to save' });
  }

  const conn = await getConn();

  try {
    const insertPromises = data.map(acc => {
      const safeDate =
        acc.date && String(acc.date).trim() !== ''
          ? acc.date
          : new Date().toISOString().slice(0, 10);

      return conn.execute(
        `INSERT INTO chart_of_accounts (code, date, title, class_type, tax_rate)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           date = VALUES(date),
           title = VALUES(title),
           class_type = VALUES(class_type),
           tax_rate = VALUES(tax_rate)`,
        [
          acc.code,
          safeDate,
          acc.title,
          acc.class_type,
          acc.tax_rate ?? 0
        ]
      );
    });

    await Promise.all(insertPromises);

    res.json({
      ok: true,
      inserted: data.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save to DB' });
  } finally {
    conn.release();
  }
});

module.exports = router;
