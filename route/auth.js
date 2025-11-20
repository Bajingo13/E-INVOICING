const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require("express-rate-limit");
const { getConn, asyncHandler } = require('../helpers/db');

const saltRounds = 10;

// -------------------------------
// Login Rate Limiter (Anti-Bruteforce)
// -------------------------------
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 10,                 // 10 attempts per minute
  message: {
    success: false,
    message: "Too many login attempts. Please try again later."
  }
});

// -------------------------------
// Middleware for Role Checking
// -------------------------------
function requireRole(role) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ message: 'Login required' });
    if (role && user.role !== role) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
}

// -------------------------------
// LOGIN
// -------------------------------
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password required' });

  if (!req.session)
    return res.status(500).json({ success: false, message: "Session not initialized" });

  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    // USER NOT FOUND -----------------------------------------
    if (!rows.length) {
      await conn.execute(
        `INSERT INTO login_history (user_id, username, success, ip_address)
         VALUES (?, ?, ?, ?)`,
        [null, username, 0, req.ip]
      );

      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    // WRONG PASSWORD -----------------------------------------
    if (!match) {
      await conn.execute(
        `INSERT INTO login_history (user_id, username, success, ip_address)
         VALUES (?, ?, ?, ?)`,
        [user.id, username, 0, req.ip]
      );

      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // SUCCESSFUL LOGIN ---------------------------------------
    await conn.execute(
      `INSERT INTO login_history (user_id, username, success, ip_address)
       VALUES (?, ?, ?, ?)`,
      [user.id, username, 1, req.ip]
    );

    // Store in session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    return res.json({
      success: true,
      user: {
        username: user.username,
        role: user.role
      }
    });

  } finally {
    conn.release();
  }
}));


// -------------------------------
// LOGOUT
// -------------------------------
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }

  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });

    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    });

    return res.json({ success: true });
  });
});

module.exports = router;
