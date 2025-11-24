// route/COA.js
const express = require('express');
const router = express.Router();
const { getConn } = require('../db');

// Async handler to catch errors
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ------------------- GET all accounts -------------------
router.get('/', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM chart_of_accounts ORDER BY code ASC');
    res.json(rows);
  } finally {
    conn.release();
  }
}));

// ------------------- GET single account -------------------
router.get('/:id', asyncHandler(async (req, res) => {
  const conn = await getConn();
  const id = req.params.id;
  try {
    const [rows] = await conn.execute('SELECT * FROM chart_of_accounts WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } finally {
    conn.release();
  }
}));

// ------------------- POST new account -------------------
router.post('/', asyncHandler(async (req, res) => {
  const { code, title, class_type, tax_rate, date } = req.body;
  if (!code || !title || !class_type) return res.status(400).json({ error: 'Missing required fields' });

  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      'INSERT INTO chart_of_accounts (code, title, class_type, tax_rate, date) VALUES (?, ?, ?, ?, ?)',
      [code, title, class_type, tax_rate || "0", date || null]
    );
    res.json({ success: true, id: result.insertId });
  } finally {
    conn.release();
  }
}));

// ------------------- PUT update account -------------------
router.put('/:id', asyncHandler(async (req, res) => {
  const { code, title, class_type, tax_rate, date } = req.body;
  const id = req.params.id;

  const conn = await getConn();
  try {
    await conn.execute(
      'UPDATE chart_of_accounts SET code=?, title=?, class_type=?, tax_rate=?, date=? WHERE id=?',
      [code, title, class_type, tax_rate || "0", date || null, id]
    );
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

// ------------------- DELETE account -------------------
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;

  const conn = await getConn();
  try {
    await conn.execute('DELETE FROM chart_of_accounts WHERE id=?', [id]);
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

module.exports = router;
