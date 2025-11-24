// db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  timezone: '+08:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
});

// Helper to get a connection
async function getConn() {
  try {
    return await pool.getConnection();
  } catch (err) {
    console.error('DB Connection Error:', err);
    throw err;
  }
}

module.exports = { pool, getConn };
