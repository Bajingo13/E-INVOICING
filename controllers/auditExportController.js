'use strict';

const ExcelJS = require('exceljs');
const { pool } = require('../helpers/db');
const { logAudit } = require('../helpers/audit');

function toBoolInt(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === '1' || v === 1 || v === true || v === 'true') return 1;
  if (v === '0' || v === 0 || v === false || v === 'false') return 0;
  return null;
}

function safeStr(v, max = 32760) {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) : s;
}

async function exportAuditExcel(req, res) {
  const {
    from, to,              // YYYY-MM-DD (recommended)
    actor_user_id,
    actor_username,
    action,
    entity_type,
    entity_id,
    success,
    q                  // search in summary/action/entity_id/actor_username
  } = req.query;

  const successInt = toBoolInt(success);

  let sql = `
    SELECT
      id, created_at,
      actor_user_id, actor_username, actor_role,
      action, entity_type, entity_id,
      success, summary,
      ip_address, user_agent, request_id,
      before_json, after_json, meta_json
    FROM audit_logs
    WHERE 1=1
  `;
  const params = [];

  if (from) { sql += ` AND created_at >= ?`; params.push(`${from} 00:00:00`); }
  if (to)   { sql += ` AND created_at <= ?`; params.push(`${to} 23:59:59`); }

  if (actor_user_id) { sql += ` AND actor_user_id = ?`; params.push(actor_user_id); }
  if (actor_username) { sql += ` AND actor_username LIKE ?`; params.push(`%${actor_username}%`); }

  if (action) { sql += ` AND action LIKE ?`; params.push(`%${action}%`); }
  if (entity_type) { sql += ` AND entity_type = ?`; params.push(entity_type); }
  if (entity_id) { sql += ` AND entity_id = ?`; params.push(entity_id); }

  if (successInt !== null) { sql += ` AND success = ?`; params.push(successInt); }

  if (q) {
    sql += ` AND (
      summary LIKE ?
      OR action LIKE ?
      OR entity_id LIKE ?
      OR actor_username LIKE ?
      OR request_id LIKE ?
    )`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY created_at DESC LIMIT 5000`; // safety cap

  const [rows] = await pool.query(sql, params);

  // ✅ Audit the export action itself (transactional)
  await logAudit(pool, req, {
    action: 'audit.export.excel',
    entity_type: 'audit_logs',
    entity_id: null,
    summary: `Exported audit logs (Excel) rows=${rows.length}`,
    success: 1,
    meta: { filters: { from, to, actor_user_id, actor_username, action, entity_type, entity_id, success: successInt, q } }
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'E-INVOICING';
  wb.created = new Date();

  const ws = wb.addWorksheet('Audit Logs');

  ws.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Created At', key: 'created_at', width: 22 },
    { header: 'Actor User ID', key: 'actor_user_id', width: 14 },
    { header: 'Actor Username', key: 'actor_username', width: 18 },
    { header: 'Actor Role', key: 'actor_role', width: 14 },
    { header: 'Action', key: 'action', width: 24 },
    { header: 'Entity Type', key: 'entity_type', width: 14 },
    { header: 'Entity ID', key: 'entity_id', width: 18 },
    { header: 'Success', key: 'success', width: 10 },
    { header: 'Summary', key: 'summary', width: 45 },
    { header: 'IP Address', key: 'ip_address', width: 16 },
    { header: 'User Agent', key: 'user_agent', width: 35 },
    { header: 'Request ID', key: 'request_id', width: 38 },
    { header: 'Before JSON', key: 'before_json', width: 40 },
    { header: 'After JSON', key: 'after_json', width: 40 },
    { header: 'Meta JSON', key: 'meta_json', width: 40 }
  ];

  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      id: r.id,
      created_at: r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '',
      actor_user_id: r.actor_user_id ?? '',
      actor_username: r.actor_username ?? '',
      actor_role: r.actor_role ?? '',
      action: r.action ?? '',
      entity_type: r.entity_type ?? '',
      entity_id: r.entity_id ?? '',
      success: r.success ? 1 : 0,
      summary: r.summary ?? '',
      ip_address: r.ip_address ?? '',
      user_agent: r.user_agent ?? '',
      request_id: r.request_id ?? '',
      before_json: safeStr(r.before_json),
      after_json: safeStr(r.after_json),
      meta_json: safeStr(r.meta_json)
    });
  }

  // Download response
  const filename = `audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await wb.xlsx.write(res);
  res.end();
}

module.exports = { exportAuditExcel };
