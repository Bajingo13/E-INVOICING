// routes/COA.js
'use strict';

const express = require('express');
const router = express.Router();

const { getConn, pool } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const { logAudit } = require('../helpers/audit');

/* ------------------- GET all accounts (NO AUDIT) ------------------- */
router.get(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.COA_VIEW),
  asyncHandler(async (req, res) => {
    const conn = await getConn();
    try {
      const [rows] = await conn.execute(`
        SELECT id, code, title, class_type, tax_rate, date, ewt_id, archived
        FROM chart_of_accounts
        ORDER BY code ASC
      `);
      res.json(rows);
    } finally {
      conn.release();
    }
  })
);

/* ------------------- CREATE new account ------------------- */
router.post(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.COA_MANAGE),
  asyncHandler(async (req, res) => {
    const { code, title, class_type, tax_rate = 0, date = null, ewt_id = null } = req.body;

    if (!code || !title || !class_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const conn = await getConn();
    try {
      const [result] = await conn.execute(
        `INSERT INTO chart_of_accounts (code, title, class_type, tax_rate, date, ewt_id, archived)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [code, title, class_type, tax_rate, date, ewt_id || null]
      );

      // ✅ AUDIT (inside handler)
      await logAudit(pool, req, {
        action: 'coa.create',
        entity_type: 'coa',
        entity_id: result.insertId,
        summary: `Created COA ${code} - ${title}`,
        success: 1,
        after: { id: result.insertId, code, title, class_type, tax_rate, date, ewt_id: ewt_id || null, archived: 0 }
      });

      res.json({ success: true, id: result.insertId });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'coa.create',
          entity_type: 'coa',
          entity_id: null,
          summary: 'Create COA failed',
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

/* ------------------- UPDATE account ------------------- */
router.put(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.COA_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { code, title, class_type, tax_rate = 0, date = null, ewt_id = null } = req.body;

    if (!code || !title || !class_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const conn = await getConn();
    try {
      const [beforeRows] = await conn.execute(
        'SELECT id, code, title, class_type, tax_rate, date, ewt_id, archived FROM chart_of_accounts WHERE id=? LIMIT 1',
        [id]
      );
      const before = beforeRows[0] || null;

      if (!before) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const [result] = await conn.execute(
        `UPDATE chart_of_accounts
         SET code = ?, title = ?, class_type = ?, tax_rate = ?, date = ?, ewt_id = ?
         WHERE id = ?`,
        [code, title, class_type, tax_rate, date, ewt_id || null, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const after = {
        ...before,
        code,
        title,
        class_type,
        tax_rate,
        date,
        ewt_id: ewt_id || null
      };

      await logAudit(pool, req, {
        action: 'coa.update',
        entity_type: 'coa',
        entity_id: id,
        summary: `Updated COA ${code} - ${title}`,
        success: 1,
        before,
        after
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'coa.update',
          entity_type: 'coa',
          entity_id: id,
          summary: `Update COA ID ${id} failed`,
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

/* ------------------- ARCHIVE ------------------- */
router.put(
  '/archive/:id',
  requireLogin,
  requirePermission(PERMISSIONS.COA_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const conn = await getConn();
    try {
      const [beforeRows] = await conn.execute(
        'SELECT id, code, title, archived FROM chart_of_accounts WHERE id=? LIMIT 1',
        [id]
      );
      const before = beforeRows[0] || null;
      if (!before) return res.status(404).json({ error: 'Account not found' });

      const [result] = await conn.execute(
        `UPDATE chart_of_accounts SET archived = 1 WHERE id = ?`,
        [id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Account not found' });

      await logAudit(pool, req, {
        action: 'coa.archive',
        entity_type: 'coa',
        entity_id: id,
        summary: `Archived COA ${before.code} - ${before.title}`,
        success: 1,
        before: { ...before },
        after: { ...before, archived: 1 }
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'coa.archive',
          entity_type: 'coa',
          entity_id: id,
          summary: `Archive COA ID ${id} failed`,
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

/* ------------------- UNARCHIVE ------------------- */
router.put(
  '/unarchive/:id',
  requireLogin,
  requirePermission(PERMISSIONS.COA_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const conn = await getConn();
    try {
      const [beforeRows] = await conn.execute(
        'SELECT id, code, title, archived FROM chart_of_accounts WHERE id=? LIMIT 1',
        [id]
      );
      const before = beforeRows[0] || null;
      if (!before) return res.status(404).json({ error: 'Account not found' });

      const [result] = await conn.execute(
        `UPDATE chart_of_accounts SET archived = 0 WHERE id = ?`,
        [id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Account not found' });

      await logAudit(pool, req, {
        action: 'coa.unarchive',
        entity_type: 'coa',
        entity_id: id,
        summary: `Unarchived COA ${before.code} - ${before.title}`,
        success: 1,
        before: { ...before },
        after: { ...before, archived: 0 }
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'coa.unarchive',
          entity_type: 'coa',
          entity_id: id,
          summary: `Unarchive COA ID ${id} failed`,
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

/* ------------------- DELETE account ------------------- */
router.delete(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.COA_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const conn = await getConn();

    try {
      const [beforeRows] = await conn.execute(
        'SELECT id, code, title, class_type, tax_rate, date, ewt_id, archived FROM chart_of_accounts WHERE id=? LIMIT 1',
        [id]
      );
      const before = beforeRows[0] || null;
      if (!before) return res.status(404).json({ error: 'Account not found' });

      const [result] = await conn.execute(
        `DELETE FROM chart_of_accounts WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }

      await logAudit(pool, req, {
        action: 'coa.delete',
        entity_type: 'coa',
        entity_id: id,
        summary: `Deleted COA ${before.code} - ${before.title}`,
        success: 1,
        before
      });

      res.json({ success: true });
    } catch (err) {
      try {
        await logAudit(pool, req, {
          action: 'coa.delete',
          entity_type: 'coa',
          entity_id: id,
          summary: `Delete COA ID ${id} failed`,
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
