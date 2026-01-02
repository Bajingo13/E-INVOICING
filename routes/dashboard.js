const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');

// ================= DASHBOARD SUMMARY =================
router.get('/', async (req, res) => {
  try {
    // Total invoices (ALL)
    const [[totalInvoices]] = await pool.query(`
      SELECT COUNT(*) AS totalInvoices
      FROM invoices
    `);

    // Total billed (exclude cancelled)
    const [[totalPayments]] = await pool.query(`
      SELECT IFNULL(SUM(total_amount_due), 0) AS totalPayments
      FROM invoices
      WHERE status != 'cancelled'
    `);

    // Pending invoices (not paid & not cancelled)
    const [[pendingInvoices]] = await pool.query(`
      SELECT COUNT(*) AS pendingInvoices
      FROM invoices
      WHERE status NOT IN ('paid', 'cancelled')
    `);

    res.json({
      totalInvoices: totalInvoices.totalInvoices,
      totalPayments: totalPayments.totalPayments,
      pendingInvoices: pendingInvoices.pendingInvoices
    });

  } catch (err) {
    console.error('❌ Dashboard error:', err);
    res.status(500).json({ error: 'Dashboard query failed' });
  }
});

module.exports = router;
