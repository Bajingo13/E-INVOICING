// routes/auditLogs.js
'use strict';

const express = require('express');
const router = express.Router();

const { pool } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const { exportAuditExcel } = require('../controllers/auditExportController');

function toBoolInt(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === '1' || v === 1 || v === true || v === 'true') return 1;
  if (v === '0' || v === 0 || v === false || v === 'false') return 0;
  return null;
}

// GET /api/audit-logs?q=&action=&entity_type=&from=&to=&success=&limit=&offset=
router.get(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE), // keep audit logs admin-only
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    const action = (req.query.action || '').trim();
    const entity_type = (req.query.entity_type || '').trim();

    const entity_id = (req.query.entity_id || '').trim();
    const actor_username = (req.query.actor_username || '').trim();
    const actor_user_id = (req.query.actor_user_id || '').trim();

    const from = (req.query.from || '').trim(); // YYYY-MM-DD
    const to = (req.query.to || '').trim();     // YYYY-MM-DD

    const successInt = toBoolInt(req.query.success);

    let limit = parseInt(req.query.limit || '200', 10);
    if (Number.isNaN(limit) || limit <= 0) limit = 200;
    if (limit > 500) limit = 500;

    let offset = parseInt(req.query.offset || '0', 10);
    if (Number.isNaN(offset) || offset < 0) offset = 0;

    const where = [];
    const params = [];

    if (from) {
      where.push('created_at >= ?');
      params.push(`${from} 00:00:00`);
    }

    if (to) {
      where.push('created_at <= ?');
      params.push(`${to} 23:59:59`);
    }

    if (action) {
      // You can switch to LIKE if you want prefix matching: action LIKE 'invoice.%'
      where.push('action = ?');
      params.push(action);
    }

    if (entity_type) {
      where.push('entity_type = ?');
      params.push(entity_type);
    }

    if (entity_id) {
      where.push('entity_id = ?');
      params.push(entity_id);
    }

    if (actor_user_id) {
      where.push('actor_user_id = ?');
      params.push(actor_user_id);
    }

    if (actor_username) {
      where.push('actor_username LIKE ?');
      params.push(`%${actor_username}%`);
    }

    if (successInt !== null) {
      where.push('success = ?');
      params.push(successInt);
    }

    if (q) {
      where.push(`(
        actor_username LIKE ?
        OR action LIKE ?
        OR entity_id LIKE ?
        OR summary LIKE ?
        OR ip_address LIKE ?
        OR request_id LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }

    const sql = `
      SELECT
        id, created_at,
        actor_user_id, actor_username, actor_role,
        action, entity_type, entity_id,
        success, summary,
        ip_address, user_agent, request_id
      FROM audit_logs
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  })
);

// ✅ GET /api/audit-logs/export/excel (same filters as list)
router.get(
  '/export/excel',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(exportAuditExcel)
);

module.exports = router;
