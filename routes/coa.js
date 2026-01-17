// routes/COA.js
'use strict';

const express = require('express');
const router = express.Router();
const { getConn } = require('../db/pool');

// ------------------- Helper: Async Wrapper -------------------
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ------------------- GET all accounts -------------------
router.get('/', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(`
      SELECT 
        id,
        code,
        title,
        class_type,
        tax_rate,
        date,
        ewt_id,
        archived
      FROM chart_of_accounts
      ORDER BY code ASC
    `);
    res.json(rows);
  } finally {
    conn.release();
  }
}));



// ------------------- CREATE new account -------------------
router.post('/', asyncHandler(async (req, res) => {
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
    res.json({ success: true, id: result.insertId });
  } finally {
    conn.release();
  }
}));


// ------------------- UPDATE account -------------------
router.put('/:id', asyncHandler(async (req, res) => {
  const { code, title, class_type, tax_rate = 0, date = null, ewt_id = null } = req.body;
  const { id } = req.params;

  if (!code || !title || !class_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      `UPDATE chart_of_accounts 
       SET code = ?, title = ?, class_type = ?, tax_rate = ?, date = ?, ewt_id = ?
       WHERE id = ?`,
      [code, title, class_type, tax_rate, date, ewt_id || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

// ------------------- ARCHIVE -------------------
router.put('/archive/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      `UPDATE chart_of_accounts SET archived = 1 WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

// ------------------- UNARCHIVE -------------------
router.put('/unarchive/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      `UPDATE chart_of_accounts SET archived = 0 WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));


// ------------------- DELETE account -------------------
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const conn = await getConn();

  try {
    const [result] = await conn.execute(
      `DELETE FROM chart_of_accounts WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } finally {
    conn.release();
  }
}));


module.exports = router;
