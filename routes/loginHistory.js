// routes/loginHistory.js
'use strict';

const express = require('express');
const router = express.Router();
const { pool, asyncHandler } = require('../db/pool');

// GET /api/login-history
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT id, user_id, username, success, ip_address, timestamp
      FROM login_history
      ORDER BY timestamp DESC
      LIMIT 100
    `);
    res.json(rows);
  })
);

module.exports = router;
