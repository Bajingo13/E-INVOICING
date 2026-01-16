'use strict';

const XLSX = require('xlsx');
const EWT = require('../models/ewtModel');

/* ===============================
   TAX RATE PARSER (fixes 1/2%)
   =============================== */
function parseTaxRate(value) {
  if (!value) return null;
  if (typeof value === 'number') return value < 1 ? value * 100 : value;

  const str = value.toString().trim();
  if (str === '1/2%' || str === '0.5%') return 0.5;
  if (str.endsWith('%')) {
    const num = parseFloat(str.replace('%', ''));
    return isNaN(num) ? null : num;
  }
  const num = parseFloat(str);
  if (!isNaN(num)) return num < 1 ? num * 100 : num;

  return null;
}

/* ===============================
   CRUD
   =============================== */
exports.getAllEWT = async (req, res) => {
  try {
    const rows = await EWT.getAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createEWT = async (req, res) => {
  try {
    const id = await EWT.create(req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateEWT = async (req, res) => {
  try {
    await EWT.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteEWT = async (req, res) => {
  try {
    await EWT.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===============================
   IMPORT EXCEL
   =============================== */
exports.importEWT = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let currentNature = null;
    let preview = [];
    let inserted = 0;

    for (const row of rows) {
      const description = row[1]; // Column B
      const taxRateRaw = row[2];  // Column C
      const indCode = row[3];     // Column D
      const corpCode = row[4];    // Column E

      if (description && typeof description === 'string' && !taxRateRaw && !indCode && !corpCode) {
        currentNature = description.trim();
        continue;
      }

      if (!currentNature || !taxRateRaw) continue;

      // Determine which code to use
      const code = indCode ? indCode.trim() : corpCode ? corpCode.trim() : null;
      if (!code) continue;

      const classification = code.startsWith('WI') ? 'WI' : 'WC';
      const taxRate = parseTaxRate(taxRateRaw);
      if (taxRate === null) continue;

      await EWT.upsert({
        code,
        classification,
        nature: currentNature,
        taxRate
      });

      preview.push({
        code,
        classification,
        nature: currentNature,
        tax_rate: taxRate.toFixed(2)
      });

      inserted++;
    }

    res.json({ inserted, preview });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Import failed', error: err.message });
  }
};
