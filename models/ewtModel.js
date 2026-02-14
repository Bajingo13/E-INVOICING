'use strict';

const { getConn } = require('../helpers/db');

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

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

  getById: async (id) => {
    const conn = await getConn();
    try {
      const [rows] = await conn.query(
        "SELECT * FROM ewt_entries WHERE id = ? LIMIT 1",
        [id]
      );
      return rows[0] || null;
    } finally {
      conn.release();
    }
  },

  create: async (data) => {
    const { code, classification, nature, taxRate } = data;

    const conn = await getConn();
    try {
      const rate = toNumberOrNull(taxRate);
      const [result] = await conn.query(
        "INSERT INTO ewt_entries (code, classification, nature, tax_rate) VALUES (?, ?, ?, ?)",
        [code, classification, nature, rate]
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
      const rate = toNumberOrNull(taxRate);
      await conn.query(
        `INSERT INTO ewt_entries (code, classification, nature, tax_rate)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           classification = VALUES(classification),
           nature = VALUES(nature),
           tax_rate = VALUES(tax_rate)`,
        [code, classification, nature, rate]
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
      const rate = toNumberOrNull(taxRate);
      await conn.query(
        "UPDATE ewt_entries SET code=?, classification=?, nature=?, tax_rate=? WHERE id=?",
        [code, classification, nature, rate, id]
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
