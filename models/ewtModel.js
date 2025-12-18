'use strict';
const { getConn } = require('../db/pool');

const EWT = {
  getAll: async () => {
    const conn = await getConn();
    try {
      const [rows] = await conn.query("SELECT * FROM ewt_entries ORDER BY code ASC");
      return rows;
    } finally {
      conn.release();
    }
  },

  create: async (data) => {
    const { code, nature, taxRate } = data;
    const conn = await getConn();
    try {
      const [result] = await conn.query(
        "INSERT INTO ewt_entries (code, nature, tax_rate) VALUES (?, ?, ?)",
        [code, nature, parseFloat(taxRate)]
      );
      return result.insertId;
    } finally {
      conn.release();
    }
  },

  update: async (id, data) => {
    const { code, nature, taxRate } = data;
    const conn = await getConn();
    try {
      await conn.query(
        "UPDATE ewt_entries SET code=?, nature=?, tax_rate=? WHERE id=?",
        [code, nature, parseFloat(taxRate), id]
      );
      return true;
    } finally {
      conn.release();
    }
  },

  delete: async (id) => {
    const conn = await getConn();
    try {
      await conn.query("DELETE FROM ewt_entries WHERE id=?", [id]);
      return true;
    } finally {
      conn.release();
    }
  }
};

module.exports = EWT;
