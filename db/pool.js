// db/pool.js - central MySQL pool
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'einvoicing',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+08:00',
  dateStrings: true
});

async function getConn() {
  const conn = await pool.getConnection();
  // helpful wrapper: release on error should be handled by caller
  return conn;
}

module.exports = { pool, getConn };
