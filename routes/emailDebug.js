'use strict';

const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');
const asyncHandler = require('../middleware/asynchandler');
const { getConn } = require('../helpers/db');

router.get(
  '/outbox',
  requireLogin,
  requirePermission(PERMISSIONS.SETTINGS_ACCESS), // or admin-only perm
  asyncHandler(async (req, res) => {
    const conn = await getConn();
    try {
      const [rows] = await conn.execute(
        `SELECT id, type, reference_no, recipient, subject, status, attempts, last_error, created_at, sent_at
         FROM email_outbox
         ORDER BY id DESC
         LIMIT 50`
      );
      res.json(rows);
    } finally {
      conn.release();
    }
  })
);

module.exports = router;
