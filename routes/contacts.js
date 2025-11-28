const express = require('express');
const router = express.Router();
const { pool, asyncHandler } = require('../Server.js'); 

async function getConn() {
  return await pool.getConnection();
}

// ----------------- GET all contacts -----------------
router.get('/', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM contacts ORDER BY name ASC');
    res.json(rows);
  } finally {
    conn.release();
  }
}));

// ----------------- POST add new contact -----------------
router.post('/', asyncHandler(async (req, res) => {
  const { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;
  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      `INSERT INTO contacts (type, code, name, phone, business, address, vat_registration, tin, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, code, name, phone, business, address, vat_registration, tin, email]
    );
    res.json({ id: result.insertId });
  } finally {
    conn.release();
  }
}));

// ----------------- PUT update contact -----------------
router.put('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;
  const conn = await getConn();
  try {
    await conn.execute(
      `UPDATE contacts 
       SET type=?, code=?, name=?, phone=?, business=?, address=?, vat_registration=?, tin=?, email=? 
       WHERE id=?`,
      [type, code, name, phone, business, address, vat_registration, tin, email, id]
    );
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

// ----------------- DELETE contact -----------------
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  const conn = await getConn();
  try {
    await conn.execute('DELETE FROM contacts WHERE id=?', [id]);
    res.json({ success: true });
  } finally {
    conn.release();
  }
}));

module.exports = router;
