// routes/users.js
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool, asyncHandler } = require('../db/pool');
const { notifyAdminUserCreated } = require('../utils/mailer');

// =========================
// GET /api/users
// =========================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT id, username, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  })
);

// =========================
// POST /api/users
// =========================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (exists.length > 0) {
      return res.status(400).json({ error: 'username already exists' });
    }

    // Hash password for DB
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    await pool.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role || 'user']
    );

    // Send email to admin with credentials (password in plain text)
    await notifyAdminUserCreated({
      username,
      role,
      password,       // raw password
      createdBy: req.user?.username || 'Admin'
    });

    res.json({ message: 'User created successfully!' });
  })
);

module.exports = router;
