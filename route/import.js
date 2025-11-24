// route/import.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getConn } = require('../db');

const upload = multer({ dest: 'uploads/' });

// --- Normalize Excel rows ---
function normalizeRow(row) {
  let dateVal = null;
  if (row.date instanceof Date) dateVal = row.date.toISOString().split('T')[0];
  else if (typeof row.date === 'string' && row.date.trim() !== '') {
    const d = new Date(row.date);
    dateVal = isNaN(d.getTime()) ? row.date : d.toISOString().split('T')[0];
  }

  const obj = {
    code: row.acct_cd != null ? String(row.acct_cd).trim() : '',
    title: row.acct_title != null ? String(row.acct_title).trim() : '',
    class_type: row.acct_type != null ? String(row.acct_type).trim() : '',
    tax_rate: row.tax_rate != null ? Number(row.tax_rate) : 0,
    date: dateVal || null
  };

  const errors = [];
  if (!obj.code) errors.push('code missing');
  if (!obj.title) errors.push('title missing');
  if (!obj.class_type) errors.push('class_type missing');

  return { obj, errors };
}

// --- Helper: parse Excel buffer using ExcelJS ---
async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0]; 

  const rows = [];

  
  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values.slice(1).map(h => h ? h.toString().trim().toLowerCase() : null);

  
  const colMap = {};
  headers.forEach((h, idx) => {
    if (h) colMap[h] = idx + 1; 
  });

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


// --- Upload & preview ---
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const buf = fs.readFileSync(req.file.path);

  try {
    const mapped = await parseExcelBuffer(buf);
    const preview = mapped.map(m => m.obj);
    const errors = mapped.map((m, i) => ({ row: i + 2, errors: m.errors })).filter(e => e.errors.length);

    fs.unlinkSync(req.file.path);
    res.json({ preview, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse Excel' });
  }
});


// --- Save to DB ---
router.post('/save', async (req, res) => {
  const data = req.body;
  if (!Array.isArray(data) || !data.length) 
    return res.status(400).json({ error: 'No data to save' });

  const conn = await getConn();
  try {
    const insertPromises = data.map(acc =>
      conn.execute(
        `INSERT INTO chart_of_accounts (code, date, title, class_type, tax_rate)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           date = VALUES(date),
           title = VALUES(title),
           class_type = VALUES(class_type),
           tax_rate = VALUES(tax_rate)`,
        [acc.code, acc.date ?? null, acc.title, acc.class_type, acc.tax_rate ?? 0]
      )
    );

    await Promise.all(insertPromises);
    res.json({ ok: true, inserted: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save to DB' });
  } finally {
    conn.release();
  }
});


module.exports = router;
