'use strict';

const XLSX = require('xlsx');
const EWT = require('../models/ewtModel');
const { logAudit } = require('../helpers/audit');
const { pool } = require('../helpers/db');

/* ===============================
   TAX RATE PARSER (fixes 1/2%)
   =============================== */
function parseTaxRate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return value < 1 ? value * 100 : value;
  }

  const str = String(value).trim();
  if (str === '1/2%' || str === '0.5%') return 0.5;

  if (str.endsWith('%')) {
    const num = parseFloat(str.replace('%', ''));
    return Number.isNaN(num) ? null : num;
  }

  const num = parseFloat(str);
  if (!Number.isNaN(num)) return num < 1 ? num * 100 : num;

  return null;
}

/* ===============================
   CLASSIFICATION DERIVER
   =============================== */
function deriveClassificationFromCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return c.startsWith('WI') ? 'WI' : 'WC';
}

/* ===============================
   NORMALIZE PAYLOAD
   - accepts taxRate or tax_rate
   - derives classification if missing
   =============================== */
function normalizeEwtPayload(body = {}) {
  const code = String(body.code ?? '').trim();
  const nature = String(body.nature ?? '').trim();

  const classification =
    (body.classification ?? body.class ?? null)
      ? String(body.classification ?? body.class).trim()
      : deriveClassificationFromCode(code);

  const rawRate = body.taxRate ?? body.tax_rate ?? body.rate ?? null;
  const parsed = parseTaxRate(rawRate);

  return {
    code,
    nature,
    classification,
    taxRate: parsed
  };
}

/* ===============================
   SMALL SNAPSHOT for audit
   =============================== */
function pickEwtSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    code: row.code ?? null,
    classification: row.classification ?? row.class ?? null,
    nature: row.nature ?? row.description ?? null,
    tax_rate: row.tax_rate ?? row.taxRate ?? null
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
    const payload = normalizeEwtPayload(req.body);

    if (!payload.code || !payload.nature) {
      return res.status(400).json({ message: 'code and nature are required' });
    }
    if (payload.taxRate === null) {
      return res.status(400).json({ message: 'taxRate is required/invalid' });
    }
    if (!payload.classification) {
      return res.status(400).json({ message: 'classification is required/invalid' });
    }

    const id = await EWT.create(payload);

    // Try to read back the created row for audit "after"
    let after = null;
    try { after = await EWT.getById(id); } catch {}

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
        tax_rate: payload.taxRate ?? null
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
    // before snapshot
    let before = null;
    try { before = await EWT.getById(id); } catch {}

    if (!before) {
      return res.status(404).json({ message: 'EWT not found' });
    }

    // normalize incoming, but DO NOT allow missing fields to wipe existing data
    const incoming = normalizeEwtPayload(req.body);

    const payload = {
      code: incoming.code || before.code,
      nature: incoming.nature || before.nature,
      classification: incoming.classification || before.classification,
      taxRate: (incoming.taxRate === null ? before.tax_rate : incoming.taxRate)
    };

    // basic validation
    if (!payload.code || !payload.nature) {
      return res.status(400).json({ message: 'code and nature are required' });
    }
    if (payload.taxRate === null || Number.isNaN(Number(payload.taxRate))) {
      return res.status(400).json({ message: 'taxRate is required/invalid' });
    }
    if (!payload.classification) {
      return res.status(400).json({ message: 'classification is required/invalid' });
    }

    await EWT.update(id, payload);

    // after snapshot
    let after = null;
    try { after = await EWT.getById(id); } catch {}

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
    let before = null;
    try { before = await EWT.getById(id); } catch {}

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

      const classification = deriveClassificationFromCode(code);
      const taxRate = parseTaxRate(taxRateRaw);
      if (taxRate === null) continue;

      await EWT.upsert({
        code,
        classification,
        nature: currentNature,
        taxRate
      });

      if (preview.length < 50) {
        preview.push({
          code,
          classification,
          nature: currentNature,
          tax_rate: Number(Number(taxRate).toFixed(2))
        });
      }

      inserted++;
    }

    await logAudit(pool, req, {
      action: 'ewt.import',
      entity_type: 'ewt',
      entity_id: null,
      summary: `Imported EWT codes from Excel`,
      success: 1,
      meta: {
        inserted,
        preview_sample: preview
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
