const express = require('express');
const router = express.Router();
const { getConn } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');


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

// ----------------- GET next contact code -----------------
router.get('/next-code', asyncHandler(async (req, res) => {
  let { type } = req.query;           // type may come from ?type=Customer
  type = type || 'Customer';          // default to Customer if undefined

  const conn = await getConn();
  try {
    const prefix = type === 'Supplier' ? 'SUP-' : 'CUST-';
    const [rows] = await conn.execute(
      `SELECT code FROM contacts WHERE type=? ORDER BY id DESC LIMIT 1`,
      [type]
    );

    let lastCode = rows[0]?.code || null;
    let nextNumber = 1;

    if (lastCode) {
      const match = lastCode.match(/-(\d+)$/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }

    const nextCode = prefix + String(nextNumber).padStart(3, '0');
    res.json({ nextCode });
  } finally {
    conn.release();
  }
}));

// ----------------- POST add new contact -----------------
router.post('/', asyncHandler(async (req, res) => {
  const { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: "Code and Name are required" });
  }

  const conn = await getConn(); // <-- initialize first
  try {
    // Check for duplicate code
    const [existing] = await conn.execute(
      'SELECT id FROM contacts WHERE code = ? LIMIT 1',
      [code]
    );

    if (existing.length) {
      return res.status(400).json({ error: 'Contact code already exists' });
    }

    // Insert new contact
    const [result] = await conn.execute(
      `INSERT INTO contacts 
       (type, code, name, phone, business, address, vat_registration, tin, email)
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
  let { type, code, name, phone, business, address, vat_registration, tin, email } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: "Code and Name are required" });
  }

  type = type ?? null;
  code = code ?? null;
  name = name ?? null;
  phone = phone ?? null;
  business = business ?? null;
  address = address ?? null;
  vat_registration = vat_registration ?? null;
  tin = tin ?? null;
  email = email ?? null;

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
