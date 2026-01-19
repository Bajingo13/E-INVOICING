'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool, asyncHandler } = require('../db/pool');
const { notifyAdminUserCreated } = require('../utils/mailer');


const VALID_ROLES = ['super', 'approver', 'submitter', 'normal'];

const { requireLogin, requireRole } = require('../middleware/roles');

// =========================
// GET /api/users
// =========================
router.get(
  '/',
  requireLogin,
  requireRole('super'),   // ONLY SUPER CAN VIEW USERS
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT id, username, email, role, created_at
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
  requireLogin,
  requireRole('super'),   // ONLY SUPER CAN CREATE USERS
  asyncHandler(async (req, res) => {
    const { username, password, role, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password and email are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (exists.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO users (username, password, email, role, password_expires_at) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, email, role, passwordExpiresAt]
    );

    await notifyAdminUserCreated({
      username,
      role,
      email,
      password,
      createdBy: req.session.user.username
    });

    res.json({ message: 'User created successfully!' });
  })
);

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,      // smtp.gmail.com or smtp.office365.com
  port: process.env.EMAIL_PORT,      // 465 (Gmail) or 587 (Outlook)
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// POST /api/users/invite
router.post(
  '/invite',
  requireLogin,
  requireRole('super'),
  asyncHandler(async (req, res) => {
    const { username, email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // check if email exists
    const [exists] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (exists.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // create token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // save invitation
    await pool.query(
      'INSERT INTO invitations (email, username, role, token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [email, username, role, token, expiresAt]
    );

    // send invite email
    await transporter.sendMail({
      from: `"User Management System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Invitation to join',
      html: `
        <h2>You have been invited</h2>
        <p>Click this link to set your password and activate your account:</p>
        <a href="${process.env.APP_URL}/invite.html?token=${token}">
          Accept Invitation
        </a>
      `
    });

    res.json({ message: 'Invitation sent!' });
  })
);
// =========================
// PUT /api/users/:id  (Update role / password)
// =========================
router.put(
  '/:id',
  requireLogin,
  requireRole('super'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, password } = req.body;

    if (!role && !password) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const updates = [];
    const values = [];

    if (role) {
      updates.push('role = ?');
      values.push(role);
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashed);

      // reset password expiry
      const passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      updates.push('password_expires_at = ?');
      values.push(passwordExpiresAt);
    }

    values.push(id);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'User updated successfully!' });
  })
);


// =========================
// DELETE /api/users/:id
// =========================
router.delete(
  '/:id',
  requireLogin,
  requireRole('super'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: 'User deleted successfully!' });
  })
);


module.exports = router;
