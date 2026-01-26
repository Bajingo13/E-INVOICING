'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const { pool, asyncHandler } = require('../db/pool');
const { notifyAdminUserCreated } = require('../utils/mailer');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const VALID_ROLES = ['super', 'approver', 'submitter'];

/* =========================
   MAIL TRANSPORT
========================= */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =========================
   GET /api/users
   Super only
========================= */
router.get(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT id, username, email, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  })
);

/* =========================
   POST /api/users
   Create user
========================= */
router.post(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { username, password, role, email } = req.body;

    if (!username || !password || !email || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (exists.length) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO users (username, password, email, role, password_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashedPassword, email, role, passwordExpiresAt]
    );

    await notifyAdminUserCreated({
      username,
      role,
      email,
      password,
      createdBy: req.session.user.username
    });

    res.json({ message: 'User created successfully' });
  })
);

/* =========================
   POST /api/users/invite
========================= */
router.post(
  '/invite',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { username, email, role } = req.body;

    if (!username || !email || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (exists.length) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO invitations (email, username, role, token, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [email, username, role, token, expiresAt]
    );

    await transporter.sendMail({
      from: `"User Management System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Invitation to join',
      html: `
        <h2>You have been invited</h2>
        <p>Click below to activate your account:</p>
        <a href="${process.env.APP_URL}/invite.html?token=${token}">
          Accept Invitation
        </a>
      `
    });

    res.json({ message: 'Invitation sent' });
  })
);

/* =========================
   PUT /api/users/:id
   Update role / password
========================= */
router.put(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, password } = req.body;

    if (!role && !password) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // 🚫 prevent self-downgrade
    if (role && req.session.user.id === Number(id) && role !== 'super') {
      return res.status(400).json({ error: 'You cannot downgrade your own account' });
    }

    // 🚫 prevent removing last super
    if (role && role !== 'super') {
      const [[count]] = await pool.query(
        'SELECT COUNT(*) AS total FROM users WHERE role = "super"'
      );
      if (count.total <= 1) {
        return res.status(400).json({ error: 'At least one Super user must exist' });
      }
    }

    const updates = [];
    const values = [];

    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push('role = ?');
      values.push(role);
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashed);

      updates.push('password_expires_at = ?');
      values.push(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    }

    values.push(id);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'User updated successfully' });
  })
);

/* =========================
   DELETE /api/users/:id
========================= */
router.delete(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 🚫 prevent self-delete
    if (req.session.user.id === Number(id)) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const [[user]] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 🚫 prevent deleting last super
    if (user.role === 'super') {
      const [[count]] = await pool.query(
        'SELECT COUNT(*) AS total FROM users WHERE role = "super"'
      );
      if (count.total <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last Super user' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  })
);

module.exports = router;
