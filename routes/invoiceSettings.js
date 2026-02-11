'use strict';

const express = require('express');
const router = express.Router();
const { getConn } = require('../helpers/db');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

// Allowed values for Xero-like Tax Defaults
const TAX_DEFAULTS_ALLOWED = new Set(['inclusive', 'exclusive', 'exempt', 'zero']);

// ---------------------- GET INVOICE SETTINGS ----------------------
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
          layout: 'standard',
          sales_tax_default: 'inclusive',
          purchase_tax_default: 'inclusive'
        });
      }

      const r = rows[0];

      res.json({
        prefix: r.prefix || 'INV-',
        last_number: (r.last_number ?? 0).toString(),
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

// ---------------------- UPDATE INVOICE PREFIX ----------------------
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

// ---------------------- UPDATE NEXT INVOICE NUMBER ----------------------
router.post(
  '/next-number',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SETTINGS),
  async (req, res) => {
    const { next_number } = req.body;

    if (!next_number || Number(next_number) < 100000) {
      return res.status(400).json({ message: 'Next invoice number must be at least 6 digits' });
    }

    let conn;
    try {
      conn = await getConn();

      // 1. Get current last_number and prefix
      const [counterRows] = await conn.execute('SELECT last_number, prefix FROM invoice_counter LIMIT 1');
      const currentLast = BigInt(counterRows?.[0]?.last_number || 0);
      const prefix = counterRows?.[0]?.prefix || 'INV-';

      const next = BigInt(next_number);

      // 2. Must be greater than current last_number
      if (next <= currentLast) {
        return res.status(400).json({
          message: `Next invoice number must be greater than current last number (${currentLast})`
        });
      }

      // 3. Check if invoice_no already exists
      const nextInvoiceNo = `${prefix}${String(next).padStart(6, '0')}`;
      const [exists] = await conn.execute(
        'SELECT COUNT(*) AS count FROM invoices WHERE invoice_no = ?',
        [nextInvoiceNo]
      );

      if (exists?.[0]?.count > 0) {
        return res.status(400).json({ message: 'This invoice number already exists' });
      }

      // 4. Save new number
      await conn.execute(
        'UPDATE invoice_counter SET last_number = ? WHERE id = 1',
        [next.toString()]
      );

      res.json({ success: true, last_number: next.toString() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to update next invoice number' });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ---------------------- UPDATE LAYOUT ----------------------
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

// ---------------------- UPDATE TAX DEFAULTS (XERO-LIKE) ----------------------
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

      res.json({
        success: true,
        sales_tax_default,
        purchase_tax_default
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to update tax defaults' });
    } finally {
      if (conn) conn.release();
    }
  }
);

module.exports = router;
