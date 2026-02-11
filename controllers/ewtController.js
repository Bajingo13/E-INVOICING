'use strict';

const XLSX = require('xlsx');
const EWT = require('../models/ewtModel');
const { logAudit } = require('../helpers/audit');
const { pool } = require('../helpers/db');

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
   SMALL SNAPSHOT for audit
   =============================== */
function pickEwtSnapshot(row) {
  if (!row) return null;

  // support various model naming styles
  return {
    id: row.id ?? null,
    code: row.code ?? null,
    classification: row.classification ?? row.class ?? null,
    nature: row.nature ?? row.description ?? null,
    tax_rate: row.taxRate ?? row.tax_rate ?? null
  };
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
    const payload = { ...req.body };

    const id = await EWT.create(payload);

    // Try to read back the created row for audit "after"
    let after = null;
    try {
      if (typeof EWT.getById === 'function') after = await EWT.getById(id);
    } catch {}

    await logAudit(pool, req, {
      action: 'ewt.create',
      entity_type: 'ewt',
      entity_id: id,
      summary: `Created EWT`,
      success: 1,
      after: pickEwtSnapshot(after) || {
        id,
        code: payload.code || null,
        classification: payload.classification || null,
        nature: payload.nature || null,
        tax_rate: payload.taxRate ?? payload.tax_rate ?? null
      }
    });

    res.json({ id });
  } catch (err) {
    try {
      await logAudit(pool, req, {
        action: 'ewt.create',
        entity_type: 'ewt',
        entity_id: null,
        summary: 'Create EWT failed',
        success: 0,
        meta: { error: String(err?.message || err) }
      });
    } catch {}

    res.status(500).json({ message: err.message });
  }
};

exports.updateEWT = async (req, res) => {
  const id = req.params.id;

  try {
    // before snapshot (if model supports it)
    let before = null;
    try {
      if (typeof EWT.getById === 'function') before = await EWT.getById(id);
    } catch {}

    await EWT.update(id, req.body);

    // after snapshot
    let after = null;
    try {
      if (typeof EWT.getById === 'function') after = await EWT.getById(id);
    } catch {}

    await logAudit(pool, req, {
      action: 'ewt.update',
      entity_type: 'ewt',
      entity_id: id,
      summary: `Updated EWT ID ${id}`,
      success: 1,
      before: pickEwtSnapshot(before),
      after: pickEwtSnapshot(after)
    });

    res.json({ success: true });
  } catch (err) {
    try {
      await logAudit(pool, req, {
        action: 'ewt.update',
        entity_type: 'ewt',
        entity_id: id,
        summary: `Update EWT ID ${id} failed`,
        success: 0,
        meta: { error: String(err?.message || err) }
      });
    } catch {}

    res.status(500).json({ message: err.message });
  }
};

exports.deleteEWT = async (req, res) => {
  const id = req.params.id;

  try {
    // before snapshot (if model supports it)
    let before = null;
    try {
      if (typeof EWT.getById === 'function') before = await EWT.getById(id);
    } catch {}

    await EWT.delete(id);

    await logAudit(pool, req, {
      action: 'ewt.delete',
      entity_type: 'ewt',
      entity_id: id,
      summary: `Deleted EWT ID ${id}`,
      success: 1,
      before: pickEwtSnapshot(before)
    });

    res.json({ success: true });
  } catch (err) {
    try {
      await logAudit(pool, req, {
        action: 'ewt.delete',
        entity_type: 'ewt',
        entity_id: id,
        summary: `Delete EWT ID ${id} failed`,
        success: 0,
        meta: { error: String(err?.message || err) }
      });
    } catch {}

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

      const code = indCode ? String(indCode).trim() : corpCode ? String(corpCode).trim() : null;
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

      // keep preview small (avoid giant logs)
      if (preview.length < 50) {
        preview.push({
          code,
          classification,
          nature: currentNature,
          tax_rate: Number(taxRate.toFixed(2))
        });
      }

      inserted++;
    }

    // ✅ AUDIT (transaction-only)
    await logAudit(pool, req, {
      action: 'ewt.import',
      entity_type: 'ewt',
      entity_id: null,
      summary: `Imported EWT codes from Excel`,
      success: 1,
      meta: {
        inserted,
        preview_sample: preview // capped to 50
      }
    });

    res.json({ inserted, preview });

  } catch (err) {
    console.error(err);

    try {
      await logAudit(pool, req, {
        action: 'ewt.import',
        entity_type: 'ewt',
        entity_id: null,
        summary: 'EWT import failed',
        success: 0,
        meta: { error: String(err?.message || err) }
      });
    } catch {}

    res.status(500).json({ message: 'Import failed', error: err.message });
  }
};
