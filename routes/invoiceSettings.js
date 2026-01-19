const express = require('express');
const router = express.Router();
const { getConn } = require('../db/pool');

// ---------------------- GET INVOICE SETTINGS ----------------------
router.get('/', async (req, res) => {
  try {
    const conn = await getConn();
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
    conn.release();

    if (!rows.length) {
      return res.json({ prefix: 'INV-', last_number: 0, layout: 'standard' });
    }

    res.json({
      prefix: rows[0].prefix,
      last_number: rows[0].last_number,
      layout: rows[0].layout || 'standard'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load settings' });
  }
});

// ---------------------- UPDATE INVOICE PREFIX ----------------------
router.post('/prefix', async (req, res) => {
  const { prefix } = req.body;
  if (!prefix) return res.status(400).json({ message: 'Prefix is required' });

  try {
    const conn = await getConn();
    await conn.execute('UPDATE invoice_counter SET prefix = ? WHERE id = 1', [prefix]);
    conn.release();
    res.json({ success: true, prefix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update prefix' });
  }
});

// ---------------------- UPDATE NEXT INVOICE NUMBER ----------------------
router.post('/next-number', async (req, res) => {
  const { next_number } = req.body;

  if (!next_number || next_number < 100000) {
    return res.status(400).json({ message: 'Next invoice number must be at least 6 digits' });
  }

  try {
    const conn = await getConn();
    await conn.execute(
      'UPDATE invoice_counter SET last_number = ? WHERE id = 1',
      [next_number - 1]
    );
    conn.release();
    res.json({ success: true, last_number: next_number - 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update next invoice number' });
  }
});

// ---------------------- UPDATE LAYOUT ----------------------
router.post('/layout', async (req, res) => {
  const { layout } = req.body;
  if (!layout) return res.status(400).json({ message: 'Layout is required' });

  try {
    const conn = await getConn();
    await conn.execute('UPDATE invoice_counter SET layout = ? WHERE id = 1', [layout]);
    conn.release();
    res.json({ success: true, layout });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update layout' });
  }
});

module.exports = router;
