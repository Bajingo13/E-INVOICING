// db/helpers.js
const mysql = require('mysql2/promise');

// ---------------------------
// MySQL Connection Pool
// ---------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'e_invoicing',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ---------------------------
// Get a connection from pool
// ---------------------------
const getConn = async () => {
  return await pool.getConnection();
};

// ---------------------------
// Async handler for Express routes
// ---------------------------
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  pool,
  getConn,
  asyncHandler
};
