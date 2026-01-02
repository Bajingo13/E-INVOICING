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

// helper to get a connection
const getConn = async () => {
  const conn = await pool.getConnection();
  return conn;
};

// helper to wrap async routes in Express
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { pool, getConn, asyncHandler };
