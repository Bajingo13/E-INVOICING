'use strict';

const { pool } = require('../helpers/db');
const { getConn } = require('../helpers/db');

const EWT = {
  getAll: async () => {
    const conn = await getConn();
    try {
      const [rows] = await conn.query(
        "SELECT * FROM ewt_entries ORDER BY classification, code ASC"
      );
      return rows;
    } finally {
      conn.release();
    }
  },

  create: async (data) => {
    const { code, classification, nature, taxRate } = data;
    const conn = await getConn();
    try {
      const [result] = await conn.query(
        "INSERT INTO ewt_entries (code, classification, nature, tax_rate) VALUES (?, ?, ?, ?)",
        [code, classification, nature, parseFloat(taxRate)]
      );
      return result.insertId;
    } finally {
      conn.release();
    }
  },

  upsert: async (data) => {
    const { code, classification, nature, taxRate } = data;
    const conn = await getConn();
    try {
      await conn.query(
        `INSERT INTO ewt_entries (code, classification, nature, tax_rate)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           nature = VALUES(nature),
           tax_rate = VALUES(tax_rate)`,
        [code, classification, nature, parseFloat(taxRate)]
      );
      return true;
    } finally {
      conn.release();
    }
  },

  update: async (id, data) => {
    const { code, classification, nature, taxRate } = data;
    const conn = await getConn();
    try {
      await conn.query(
        "UPDATE ewt_entries SET code=?, classification=?, nature=?, tax_rate=? WHERE id=?",
        [code, classification, nature, parseFloat(taxRate), id]
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
