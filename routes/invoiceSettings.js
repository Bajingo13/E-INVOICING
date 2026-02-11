'use strict';

const express = require('express');
const router = express.Router();
const { getConn } = require('../helpers/db');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

// Allowed values for Xero-like Tax Defaults
const TAX_DEFAULTS_ALLOWED = new Set(['inclusive', 'exclusive', 'exempt', 'zero']);

// ✅ Only 2 modes (as you requested)
const NUMBERING_MODES_ALLOWED = new Set(['auto', 'manual']);

function normalizeMode(v) {
  const val = String(v || '').trim().toLowerCase();
  return NUMBERING_MODES_ALLOWED.has(val) ? val : 'auto';
}

// start_number must be >= 1 (we'll store last_number = start-1)
function normalizeStartNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
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
      const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');

      if (!rows.length) {
        return res.json({
          prefix: 'INV-',
          last_number: '0',
          numbering_mode: 'auto',
          layout: 'standard',
          sales_tax_default: 'inclusive',
          purchase_tax_default: 'inclusive'
        });
      }

      const r = rows[0];

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
   UPDATE NUMBERING MODE (AUTO / MANUAL) + OPTIONAL START NUMBER
   Body:
   {
     "numbering_mode": "auto" | "manual",
     "start_number": 1001 (optional, only meaningful when auto)
   }
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

      // Lock counter row
      const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ message: 'Invoice counter not initialized' });
      }

      const counter = rows[0];
      let newLastNumber = BigInt(counter.last_number || 0);

      // ✅ If switching to AUTO and start_number provided:
      // set last_number = start_number - 1 so next generated = start_number
      if (mode === 'auto' && startNumber !== null) {
        const desiredNext = BigInt(startNumber);

        if (desiredNext < 1n) {
          await conn.rollback();
          return res.status(400).json({ message: 'Start number must be >= 1' });
        }

        // Validate against existing invoices:
        const [maxRows] = await conn.execute(
          `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^[^0-9]+', '') AS UNSIGNED)) AS max_no
           FROM invoices`
        );
        const maxInvoice = BigInt(maxRows?.[0]?.max_no || 0);

        if (desiredNext <= maxInvoice) {
          await conn.rollback();
          return res.status(400).json({
            message: `Start number must be greater than existing max invoice number (${maxInvoice.toString()})`
          });
        }

        newLastNumber = desiredNext - 1n;
      }

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
   UPDATE INVOICE PREFIX
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
      await conn.execute('UPDATE invoice_counter SET prefix = ? WHERE id = 1', [prefix]);
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
   Body: { next_number: 100001 }
   ✅ FIXED: stores last_number = next_number - 1
========================================================= */
router.post(
  '/next-number',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const nextRaw = req.body?.next_number;

    const next = BigInt(Number(nextRaw));
    if (!nextRaw || next < 1n) {
      return res.status(400).json({ message: 'Next invoice number must be at least 1' });
    }

    let conn;
    try {
      conn = await getConn();
      await conn.beginTransaction();

      // Lock counter row
      const [counterRows] = await conn.execute(
        'SELECT id, last_number, prefix FROM invoice_counter LIMIT 1 FOR UPDATE'
      );
      if (!counterRows.length) {
        await conn.rollback();
        return res.status(404).json({ message: 'Invoice counter not initialized' });
      }

      const counter = counterRows[0];
      const currentLast = BigInt(counter.last_number || 0);
      const prefix = counter.prefix || 'INV-';

      // next must be > current last+1? (we only enforce it doesn’t go backwards)
      // If you want strictly increasing, compare against (currentLast + 1n)
      const currentNext = currentLast + 1n;
      if (next < currentNext) {
        await conn.rollback();
        return res.status(400).json({
          message: `Next invoice number cannot be lower than the current next number (${currentNext.toString()})`
        });
      }

      // Check if that exact invoice_no already exists
      const nextInvoiceNo = `${prefix}${String(next).padStart(6, '0')}`;
      const [exists] = await conn.execute(
        'SELECT COUNT(*) AS count FROM invoices WHERE invoice_no = ?',
        [nextInvoiceNo]
      );
      if (exists?.[0]?.count > 0) {
        await conn.rollback();
        return res.status(400).json({ message: 'This invoice number already exists' });
      }

      // ✅ store last_number = next - 1 so next generated equals next
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
   UPDATE LAYOUT
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
      await conn.execute('UPDATE invoice_counter SET layout = ? WHERE id = 1', [layout]);
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
   UPDATE TAX DEFAULTS (XERO-LIKE)
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
      await conn.execute(
        'UPDATE invoice_counter SET sales_tax_default = ?, purchase_tax_default = ? WHERE id = 1',
        [sales_tax_default, purchase_tax_default]
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
