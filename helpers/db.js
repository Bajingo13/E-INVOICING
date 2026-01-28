'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool(
  process.env.DATABASE_URL
    ? {
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      }
);

pool.on?.('connection', () => {
  console.log(
    `🛢️ MySQL connected (${process.env.DATABASE_URL ? 'UAT' : 'LOCAL'})`
  );
});

async function getConn() {
  return await pool.getConnection();
}

module.exports = {
  pool,
  getConn
};
