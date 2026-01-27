'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  uri: process.env.MYSQL_URL,   // <-- change this
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 15000
});

async function getConn() {
  return await pool.getConnection();
}

module.exports = {
  pool,
  getConn
};
