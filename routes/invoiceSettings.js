'use strict';

const express = require('express');
const router = express.Router();
const { getConn } = require('../helpers/db');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

// Allowed values for Xero-like Tax Defaults
const TAX_DEFAULTS_ALLOWED = new Set(['inclusive', 'exclusive', 'exempt', 'zero']);

// ✅ Only 2 modes
const NUMBERING_MODES_ALLOWED = new Set(['auto', 'manual']);

function normalizeMode(v) {
  const val = String(v || '').trim().toLowerCase();
  return NUMBERING_MODES_ALLOWED.has(val) ? val : 'auto';
}

function normalizeStartNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function buildInvoiceNo(prefix, n) {
  const p = (prefix || 'INV-').trim() || 'INV-';
  return `${p}${String(n).padStart(6, '0')}`;
}

// ✅ Always fetch the same counter row your app uses
async function getCounterRow(conn, forUpdate = false) {
  const sql = forUpdate
    ? 'SELECT * FROM invoice_counter ORDER BY id ASC LIMIT 1 FOR UPDATE'
    : 'SELECT * FROM invoice_counter ORDER BY id ASC LIMIT 1';

  const [rows] = await conn.execute(sql);
  return rows[0] || null;
}

/* =========================================================
   GET INVOICE SETTINGS
========================================================= */
router.get(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    let conn;
    try {
      conn = await getConn();
      const r = await getCounterRow(conn, false);

      if (!r) {
        return res.json({
          prefix: 'INV-',
          last_number: '0',
          numbering_mode: 'auto',
          layout: 'standard',
          sales_tax_default: 'inclusive',
          purchase_tax_default: 'inclusive'
        });
      }

      res.json({
        prefix: r.prefix || 'INV-',
        last_number: (r.last_number ?? 0).toString(),
        numbering_mode: r.numbering_mode || 'auto',
        layout: r.layout || 'standard',
        sales_tax_default: r.sales_tax_default || 'inclusive',
        purchase_tax_default: r.purchase_tax_default || 'inclusive'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to load settings' });
    } finally {
      if (conn) conn.release();
    }
  }
);

/* =========================================================
   UPDATE NUMBERING MODE + OPTIONAL START NUMBER
========================================================= */
router.post(
  '/numbering',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const mode = normalizeMode(req.body.numbering_mode);
    const startNumber = normalizeStartNumber(req.body.start_number);

    let conn;
    try {
      conn = await getConn();
      await conn.beginTransaction();

      const counter = await getCounterRow(conn, true);
      if (!counter) {
        await conn.rollback();
        return res.status(404).json({ message: 'Invoice counter not initialized' });
      }

      const prefix = counter.prefix || 'INV-';
      let newLastNumber = BigInt(counter.last_number || 0);

      // AUTO + start_number: only block duplicates
      if (mode === 'auto' && startNumber !== null) {
        const desiredNext = BigInt(startNumber);
        if (desiredNext < 1n) {
          await conn.rollback();
          return res.status(400).json({ message: 'Start number must be >= 1' });
        }

        const candidateInvoiceNo = buildInvoiceNo(prefix, desiredNext.toString());
        const [exists] = await conn.execute(
          'SELECT 1 FROM invoices WHERE invoice_no = ? LIMIT 1',
          [candidateInvoiceNo]
        );

        if (exists.length) {
          await conn.rollback();
          return res.status(400).json({
            message: `Invoice number already exists (${candidateInvoiceNo}). Choose a different start number.`
          });
        }

        newLastNumber = desiredNext - 1n;
      }

      // MANUAL: ignore start_number, just set mode
      await conn.execute(
        'UPDATE invoice_counter SET numbering_mode=?, last_number=? WHERE id=?',
        [mode, newLastNumber.toString(), counter.id]
      );

      await conn.commit();

      res.json({
        success: true,
        numbering_mode: mode,
        last_number: newLastNumber.toString()
      });
    } catch (err) {
      try { await conn?.rollback(); } catch {}
      console.error(err);
      res.status(500).json({ message: 'Failed to update numbering settings' });
    } finally {
      if (conn) conn.release();
    }
  }
);

/* =========================================================
   UPDATE INVOICE PREFIX  ✅ FIXED (no id=1)
========================================================= */
router.post(
  '/prefix',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const prefix = (req.body.prefix || '').trim();

    if (prefix.length < 2) {
      return res.status(400).json({ message: 'Prefix must be at least 2 characters' });
    }

    let conn;
    try {
      conn = await getConn();
      const counter = await getCounterRow(conn, false);
      if (!counter) return res.status(404).json({ message: 'Invoice counter not initialized' });

      await conn.execute('UPDATE invoice_counter SET prefix = ? WHERE id = ?', [prefix, counter.id]);
      res.json({ success: true, prefix });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to update prefix' });
    } finally {
      if (conn) conn.release();
    }
  }
);

/* =========================================================
   UPDATE NEXT INVOICE NUMBER (SET NEXT)
========================================================= */
router.post(
  '/next-number',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const nextRaw = req.body?.next_number;

    const nNum = Number(nextRaw);
    if (!Number.isFinite(nNum) || nNum < 1) {
      return res.status(400).json({ message: 'Next invoice number must be at least 1' });
    }

    const next = BigInt(Math.floor(nNum));

    let conn;
    try {
      conn = await getConn();
      await conn.beginTransaction();

      const counter = await getCounterRow(conn, true);
      if (!counter) {
        await conn.rollback();
        return res.status(404).json({ message: 'Invoice counter not initialized' });
      }

      const prefix = counter.prefix || 'INV-';

      // Only block duplicates
      const nextInvoiceNo = buildInvoiceNo(prefix, next.toString());
      const [exists] = await conn.execute(
        'SELECT 1 FROM invoices WHERE invoice_no = ? LIMIT 1',
        [nextInvoiceNo]
      );
      if (exists.length) {
        await conn.rollback();
        return res.status(400).json({ message: `This invoice number already exists (${nextInvoiceNo})` });
      }

      const newLast = next - 1n;

      await conn.execute(
        'UPDATE invoice_counter SET last_number = ? WHERE id = ?',
        [newLast.toString(), counter.id]
      );

      await conn.commit();
      res.json({ success: true, last_number: newLast.toString() });
    } catch (err) {
      try { await conn?.rollback(); } catch {}
      console.error(err);
      res.status(500).json({ message: 'Failed to update next invoice number' });
    } finally {
      if (conn) conn.release();
    }
  }
);

/* =========================================================
   UPDATE LAYOUT ✅ FIXED (no id=1)
========================================================= */
router.post(
  '/layout',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const { layout } = req.body;
    if (!layout) return res.status(400).json({ message: 'Layout is required' });

    let conn;
    try {
      conn = await getConn();
      const counter = await getCounterRow(conn, false);
      if (!counter) return res.status(404).json({ message: 'Invoice counter not initialized' });

      await conn.execute('UPDATE invoice_counter SET layout = ? WHERE id = ?', [layout, counter.id]);
      res.json({ success: true, layout });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to update layout' });
    } finally {
      if (conn) conn.release();
    }
  }
);

/* =========================================================
   UPDATE TAX DEFAULTS ✅ FIXED (no id=1)
========================================================= */
router.post(
  '/tax-defaults',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const sales_tax_default = String(req.body.sales_tax_default || '').trim().toLowerCase();
    const purchase_tax_default = String(req.body.purchase_tax_default || '').trim().toLowerCase();

    if (!TAX_DEFAULTS_ALLOWED.has(sales_tax_default)) {
      return res.status(400).json({ message: 'Invalid sales tax default' });
    }
    if (!TAX_DEFAULTS_ALLOWED.has(purchase_tax_default)) {
      return res.status(400).json({ message: 'Invalid purchase tax default' });
    }

    let conn;
    try {
      conn = await getConn();
      const counter = await getCounterRow(conn, false);
      if (!counter) return res.status(404).json({ message: 'Invoice counter not initialized' });

      await conn.execute(
        'UPDATE invoice_counter SET sales_tax_default = ?, purchase_tax_default = ? WHERE id = ?',
        [sales_tax_default, purchase_tax_default, counter.id]
      );

      res.json({ success: true, sales_tax_default, purchase_tax_default });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to update tax defaults' });
    } finally {
      if (conn) conn.release();
    }
  }
);

module.exports = router;
