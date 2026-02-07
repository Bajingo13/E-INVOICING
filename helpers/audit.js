// helpers/audit.js
'use strict';
const { getConn } = require('./db');

async function logAction(userId, actionType, entityType, entityId = null, description = '') {
  if (!userId) return; // prevent logging if no user

  const conn = await getConn();
  try {
    await conn.execute(
      `INSERT INTO audit_trail 
       (user_id, action_type, entity_type, entity_id, description, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, actionType, entityType, entityId, description]
    );
  } finally {
    conn.release();
  }
}

module.exports = { logAction };
