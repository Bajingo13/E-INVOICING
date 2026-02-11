'use strict';

const express = require('express');
const router = express.Router();

const { getConn, pool } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');
const { logAudit } = require('../helpers/audit');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

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
