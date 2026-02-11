'use strict';

const { getConn } = require('../helpers/db');

function normalizeMode(v) {
  const val = String(v || '').toLowerCase().trim();
  return (val === 'manual') ? 'manual' : 'auto';
}

function normalizePrefix(v) {
  const p = String(v ?? '').trim();
  return p || 'INV-';
}

function normalizeStartNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

// GET current settings
async function getInvoiceSettings(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    if (!rows.length) return res.status(404).json({ error: 'Invoice counter not initialized' });

    const c = rows[0];
    res.json({
      numbering_mode: c.numbering_mode,
      prefix: c.prefix,
      last_number: Number(c.last_number || 0),
      layout: c.layout,
      sales_tax_default: c.sales_tax_default,
      purchase_tax_default: c.purchase_tax_default
    });
  } finally {
    conn.release();
  }
}

// PUT update settings
async function updateInvoiceSettings(req, res) {
  const conn = await getConn();
  try {
    const mode = normalizeMode(req.body.numbering_mode);
    const prefix = normalizePrefix(req.body.prefix);
    const startNumber = normalizeStartNumber(req.body.start_number);

    await conn.beginTransaction();

    // lock the counter row
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invoice counter not initialized' });
    }
    const counter = rows[0];

    // If auto and user provided a starting number, set last_number = start-1
    let newLast = counter.last_number;
    if (mode === 'auto' && startNumber) {
      newLast = BigInt(startNumber - 1).toString();
    }

    await conn.execute(
      `UPDATE invoice_counter
       SET numbering_mode=?, prefix=?, last_number=?
       WHERE id=?`,
      [mode, prefix, String(newLast ?? 0), counter.id]
    );

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('updateInvoiceSettings error:', err);
    res.status(500).json({ error: 'Failed to update invoice settings' });
  } finally {
    conn.release();
  }
}

module.exports = {
  getInvoiceSettings,
  updateInvoiceSettings
};
