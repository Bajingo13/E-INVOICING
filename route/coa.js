// route/COA.js
const express = require('express');
const router = express.Router();
const { getConn } = require('../db'); // your db.js should export getConn()

// Async wrapper for cleaner error handling
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET all COA records
router.get('/', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM coa ORDER BY code ASC');
    res.json(rows);
  } finally {
    conn.release();
  }
}));

// GET single COA by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const conn = await getConn();
  const id = req.params.id;
  try {
    const [rows] = await conn.execute('SELECT * FROM coa WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } finally {
    conn.release();
  }
}));

// POST new COA
router.post('/', asyncHandler(async (req, res) => {
  const { code, description, type, tax_rate } = req.body;
  if (!code || !description || !type) return res.status(400).json({ error: 'Missing required fields' });

  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      'INSERT INTO coa (code, description, type, tax_rate) VALUES (?, ?, ?, ?)',
      [code, description, type, tax_rate || "0"]
    );
    res.json({ success: true, id: result.insertId });
  } finally {
    conn.release();
  }
}));

// PUT update COA
router.put('/:id', asyncHandler(async (req, res) => {
  const { code, description, type, tax_rate } = req.body;
  const id = req.params.id;
  const conn = await getConn();
  try {
    await conn.execute(
      'UPDATE coa SET code=?, description=?, type=?, tax_rate=? WHERE id=?',
      [code, description, type, tax_rate || "0", id]
    );
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

// DELETE COA
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const conn = await getConn();
  try {
    await conn.execute('DELETE FROM coa WHERE id=?', [id]);
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

module.exports = router;
