'use strict';

const { pool } = require('../db/pool');

async function getApprovers() {
  const [rows] = await pool.query(`
    SELECT DISTINCT u.id, u.email
    FROM users u
    JOIN role_permissions rp ON u.role = rp.role
    JOIN permissions p ON rp.permission_id = p.id
    WHERE p.name = 'INVOICE_APPROVE'
  `);

  return rows;
}

module.exports = { getApprovers };
