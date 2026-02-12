'use strict';

const express = require('express');
const router = express.Router();

const { getConn, pool } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');
const { logAudit } = require('../helpers/audit');

const { requireLogin } = require('../middleware/roles');
// const { requirePermission } = require('../middleware/permissions');
// const { PERMISSIONS } = require('../config/permissions');

// ✅ IMPORT deps
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

/* ----------------- Helpers for import ----------------- */

// Normalize header text
function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Find header row index + header->colIndex map
function detectHeaderRow(rows) {
  // We look for a row that contains "CODE" and "NAME"
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const headers = row.map(norm);

    const hasCode = headers.includes('CODE');
    const hasName = headers.includes('NAME');

    if (hasCode && hasName) {
      const map = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        map[h] = idx;
      });
      return { headerRowIndex: r, headerMap: map };
    }
  }
  return null;
}

function getCell(row, idx) {
  if (!row || idx === undefined || idx === null) return '';
  return String(row[idx] ?? '').trim();
}

function parseWorkbookToRows(buffer, originalName = '') {
  // XLSX can read .xlsx buffers; for .csv it usually works too
  // (if it fails on csv in your environment, tell me and I’ll give a CSV parser fallback)
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Return raw rows (array of arrays)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

/* ----------------- GET all contacts (NO AUDIT) ----------------- */
router.get(
  '/',
  requireLogin,
  // requirePermission(PERMISSIONS.CONTACT_VIEW), // optional if you have it
  asyncHandler(async (req, res) => {
    const conn = await getConn();
    try {
      const [rows] = await conn.execute('SELECT * FROM contacts ORDER BY name ASC');
      res.json(rows);
    } finally {
      conn.release();
    }
  })
);

/* ----------------- GET next contact code (NO AUDIT) ----------------- */
router.get(
  '/next-code',
  requireLogin,
  // requirePermission(PERMISSIONS.CONTACT_MANAGE), // optional
  asyncHandler(async (req, res) => {
    let { type } = req.query;
    type = type || 'Customer';

    const conn = await getConn();
    try {
      const prefix = type === 'Supplier' ? 'SUP-' : 'CUST-';
      const [rows] = await conn.execute(
        `SELECT code FROM contacts WHERE type=? ORDER BY id DESC LIMIT 1`,
        [type]
      );

      let lastCode = rows[0]?.code || null;
      let nextNumber = 1;

      if (lastCode) {
        const match = lastCode.match(/-(\d+)$/);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
      }

      const nextCode = prefix + String(nextNumber).padStart(3, '0');
      res.json({ nextCode });
    } finally {
      conn.release();
    }
  })
);

/* ----------------- POST import contacts (XLSX/CSV) -----------------
   POST /api/contacts/import
   multipart/form-data:
     file: .xlsx/.csv
     type: Customer | Supplier  (required)
--------------------------------------------------------------- */
router.post(
  '/import',
  requireLogin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'File is required.' });
    }

    const conn = await getConn();

    let inserted = 0;
    let skipped_invalid_prefix = 0;
    let skipped_invalid_data = 0;

    // Code generation counters
    const next = {
      Customer: { prefix: 'CUST-', num: 1 },
      Supplier: { prefix: 'SUP-', num: 1 }
    };

    function detectTypeFromExcelCode(codeRaw) {
      const code = String(codeRaw || '').trim().toUpperCase();

      if (code.startsWith('CUS')) return 'Customer';
      if (code.startsWith('SUP')) return 'Supplier';

      return null; // ❌ invalid prefix
    }

    function makeCode(type) {
      const info = next[type];
      const code = info.prefix + String(info.num).padStart(3, '0');
      info.num++;
      return code;
    }

    try {
      // 1️⃣ Initialize counters once
      for (const type of ['Customer', 'Supplier']) {
        const [rows] = await conn.execute(
          `SELECT code FROM contacts WHERE type=? ORDER BY id DESC LIMIT 1`,
          [type]
        );

        const lastCode = rows[0]?.code || null;
        if (lastCode) {
          const match = String(lastCode).match(/-(\d+)$/);
          if (match) next[type].num = parseInt(match[1], 10) + 1;
        }
      }

      // 2️⃣ Parse sheet
      const sheetRows = parseWorkbookToRows(req.file.buffer, req.file.originalname);
      const headerInfo = detectHeaderRow(sheetRows);

      if (!headerInfo) {
        return res.status(400).json({
          error: 'Headers not detected. Expecting CODE and NAME columns.'
        });
      }

      const { headerRowIndex, headerMap } = headerInfo;

      const idxCode = headerMap['CODE'];
      const idxName = headerMap['NAME'];
      const idxAddress = headerMap['ADRESS'] ?? headerMap['ADDRESS'];
      const idxTel = headerMap['TEL'];
      const idxTin = headerMap['TIN NO'] ?? headerMap['TIN'];

      const dataRows = sheetRows.slice(headerRowIndex + 1);

      const insertSql = `
        INSERT INTO contacts
          (type, code, name, phone, business, address, vat_registration, tin, email)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // 3️⃣ Insert rows
      for (const r of dataRows) {

        const excelCode = getCell(r, idxCode);
        const business = getCell(r, idxName);
        const address = getCell(r, idxAddress);
        const phone = getCell(r, idxTel);
        const tin = getCell(r, idxTin);

        // Must have prefix CUS or SUP
        const type = detectTypeFromExcelCode(excelCode);
        if (!type) {
          skipped_invalid_prefix++;
          continue;
        }

        // Must have company name
        if (!business) {
          skipped_invalid_data++;
          continue;
        }

        const newCode = makeCode(type);

        await conn.execute(insertSql, [
          type,
          newCode,
          business,        // name (fallback)
          phone || null,
          business,
          address || null,
          null,
          tin || null,
          null
        ]);

        inserted++;
      }

      // 4️⃣ Audit log
      try {
        await logAudit(pool, req, {
          action: 'contact.import',
          entity_type: 'contact',
          entity_id: null,
          summary: 'Imported contacts (CUS/SUP prefix rule)',
          success: 1,
          meta: {
            inserted,
            skipped_invalid_prefix,
            skipped_invalid_data,
            filename: req.file.originalname
          }
        });
      } catch {}

      res.json({
        inserted,
        skipped_invalid_prefix,
        skipped_invalid_data
      });

    } catch (err) {
      console.error(err);

      try {
        await logAudit(pool, req, {
          action: 'contact.import',
          entity_type: 'contact',
          entity_id: null,
          summary: 'Import contacts failed',
          success: 0,
          meta: { error: String(err?.message || err) }
        });
      } catch {}

      res.status(500).json({ error: 'Import failed.' });
    } finally {
      conn.release();
    }
  })
);


/* ----------------- POST add new contact ----------------- */
router.post(
  '/',
  requireLogin,
  // requirePermission(PERMISSIONS.CONTACT_MANAGE), // optional
  asyncHandler(async (req, res) => {
    const { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    const conn = await getConn();
    try {
      const [existing] = await conn.execute(
        'SELECT id FROM contacts WHERE code = ? LIMIT 1',
        [code]
      );

      if (existing.length) {
        return res.status(400).json({ error: 'Contact code already exists' });
      }

      const [result] = await conn.execute(
        `INSERT INTO contacts
         (type, code, name, phone, business, address, vat_registration, tin, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [type, code, name, phone, business, address, vat_registration, tin, email]
      );

      await logAudit(pool, req, {
        action: 'contact.create',
        entity_type: 'contact',
        entity_id: result.insertId,
        summary: `Created contact ${name}`,
        success: 1,
        after: { id: result.insertId, type, code, name, phone, business, address, vat_registration, tin, email }
      });

      res.json({ id: result.insertId });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'contact.create',
          entity_type: 'contact',
          entity_id: null,
          summary: 'Create contact failed',
          success: 0,
          meta: { error: String(err?.code || err?.message || err) }
        });
      } catch {}

      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ----------------- PUT update contact ----------------- */
router.put(
  '/:id',
  requireLogin,
  // requirePermission(PERMISSIONS.CONTACT_MANAGE), // optional
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    let { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    type = type ?? null;
    code = code ?? null;
    name = name ?? null;
    phone = phone ?? null;
    business = business ?? null;
    address = address ?? null;
    vat_registration = vat_registration ?? null;
    tin = tin ?? null;
    email = email ?? null;

    const conn = await getConn();
    try {
      const [beforeRows] = await conn.execute('SELECT * FROM contacts WHERE id=? LIMIT 1', [id]);
      const before = beforeRows[0] || null;

      if (!before) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      await conn.execute(
        `UPDATE contacts
         SET type=?, code=?, name=?, phone=?, business=?, address=?, vat_registration=?, tin=?, email=?
         WHERE id=?`,
        [type, code, name, phone, business, address, vat_registration, tin, email, id]
      );

      const after = { ...before, type, code, name, phone, business, address, vat_registration, tin, email };

      await logAudit(pool, req, {
        action: 'contact.update',
        entity_type: 'contact',
        entity_id: id,
        summary: `Updated contact ${name}`,
        success: 1,
        before,
        after
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'contact.update',
          entity_type: 'contact',
          entity_id: id,
          summary: `Update contact ID ${id} failed`,
          success: 0,
          meta: { error: String(err?.code || err?.message || err) }
        });
      } catch {}

      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ----------------- DELETE contact ----------------- */
router.delete(
  '/:id',
  requireLogin,
  // requirePermission(PERMISSIONS.CONTACT_MANAGE), // optional
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const conn = await getConn();

    try {
      const [beforeRows] = await conn.execute('SELECT * FROM contacts WHERE id=? LIMIT 1', [id]);
      const before = beforeRows[0] || null;

      if (!before) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const [result] = await conn.execute('DELETE FROM contacts WHERE id=?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      await logAudit(pool, req, {
        action: 'contact.delete',
        entity_type: 'contact',
        entity_id: id,
        summary: `Deleted contact ${before?.name || before?.business || before?.code || id}`,
        success: 1,
        before
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'contact.delete',
          entity_type: 'contact',
          entity_id: id,
          summary: `Delete contact ID ${id} failed`,
          success: 0,
          meta: { error: String(err?.code || err?.message || err) }
        });
      } catch {}

      throw err;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;
