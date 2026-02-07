'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { getConn } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');
const { logAction } = require('../helpers/audit'); // ✅ Audit

const { ROLE_PERMISSIONS } = require('../config/rolePermissions');

const router = express.Router();
const saltRounds = 10;

// -------------------------------
// Login Rate Limiter (Anti-Bruteforce)
// -------------------------------
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again later." }
});

// -------------------------------
// Constants
// -------------------------------
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

// -------------------------------
// Middleware to attach req.user
// -------------------------------
router.use((req, res, next) => {
  req.user = req.session?.user || null;
  next();
});

// -------------------------------
// LOGIN
// -------------------------------
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password required' });

  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);

    if (!rows.length) {
      // Unknown username -> log failed attempt as system
      try {
        await logAction(null, 'FAILED_LOGIN', 'SYSTEM', null, `Failed login for unknown username: ${username}`);
      } catch (err) {
        console.error('Audit log failed (FAILED_LOGIN unknown user):', err);
      }
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const user = rows[0];

    // Check if account is locked
    if (user.status === 'locked' && user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(403).json({ success: false, message: 'Account locked. Reset password.' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      // Failed login attempt
      let attempts = user.failed_login_attempts + 1;
      let status = 'active';
      let locked_until = null;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        status = 'locked';
        locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
      }

      await conn.execute(
        "UPDATE users SET failed_login_attempts=?, status=?, locked_until=? WHERE id=?",
        [attempts, status, locked_until, user.id]
      );

      // Log failed login
      try {
        await logAction(
          user.id,
          'FAILED_LOGIN',
          'SYSTEM',
          null,
          `Failed login attempt (${attempts} of ${MAX_LOGIN_ATTEMPTS})`
        );
      } catch (err) {
        console.error('Audit log failed (FAILED_LOGIN):', err);
      }

      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Success login: reset failed attempts
    await conn.execute(
      "UPDATE users SET failed_login_attempts=0, status='active', locked_until=NULL WHERE id=?",
      [user.id]
    );

    const userRole = user.role;
    req.session.user = {
      id: user.id,
      username: user.username,
      role: userRole,
      permissions: ROLE_PERMISSIONS[userRole] || []
    };
    req.user = req.session.user; // attach for downstream routes

    // Log successful login
    try {
      await logAction(
        user.id,
        'LOGIN',
        'SYSTEM',
        null,
        `User ${user.username} logged in successfully`
      );
    } catch (err) {
      console.error('Audit log failed (LOGIN):', err);
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: userRole
      }
    });

  } finally {
    conn.release();
  }
}));

// -------------------------------
// LOGOUT
// -------------------------------
router.post('/logout', asyncHandler(async (req, res) => {
  const userId = req.session?.user?.id;

  if (!req.session) return res.json({ success: true });

  req.session.destroy(async (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });

    res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax' });

    // Log logout
    if (userId) {
      try {
        await logAction(
          userId,
          'LOGOUT',
          'SYSTEM',
          null,
          'User logged out'
        );
      } catch (err) {
        console.error('Audit log failed (LOGOUT):', err);
      }
    }

    return res.json({ success: true });
  });
}));

// -------------------------------
// CURRENT USER (needed by RBAC)
// -------------------------------
router.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ success: false, message: 'Not logged in' });

  return res.json({
    success: true,
    user: req.session.user
  });
});

module.exports = router;
