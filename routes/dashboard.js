'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../helpers/db');

// ================= DASHBOARD SUMMARY =================
router.get('/', async (req, res) => {
  try {
    // Total invoices (ALL)
    const [[totalInvoices]] = await pool.query(`
      SELECT COUNT(*) AS totalInvoices
      FROM invoices
    `);

    // ✅ Total billed: unpaid pipeline (pending + approved)
    // (submit => pending; approve => approved; paid is excluded)
    const [[totalPayments]] = await pool.query(`
      SELECT IFNULL(SUM(total_amount_due), 0) AS totalPayments
      FROM invoices
      WHERE status IN ('pending', 'approved')
    `);

    // ✅ Pending invoices count: ONLY pending
    const [[pendingInvoices]] = await pool.query(`
      SELECT COUNT(*) AS pendingInvoices
      FROM invoices
      WHERE status = 'pending'
    `);

    res.json({
      totalInvoices: Number(totalInvoices.totalInvoices) || 0,
      totalPayments: Number(totalPayments.totalPayments) || 0,
      pendingInvoices: Number(pendingInvoices.pendingInvoices) || 0
    });
  } catch (err) {
    console.error('❌ Dashboard error:', err);
    res.status(500).json({ error: 'Dashboard query failed' });
  }
});

module.exports = router;
