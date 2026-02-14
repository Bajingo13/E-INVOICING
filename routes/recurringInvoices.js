'use strict';

const express = require('express');
const router = express.Router();
const { runMonthlyRecurringInvoices } = require('../services/invoiceRecurringMonthly');

// ✅ Manila date string (YYYY-MM-DD) WITHOUT external libs
function manilaTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

// POST /api/recurring-invoices/run
// optional body: { todayISO: "YYYY-MM-DD" }
router.post('/run', async (req, res) => {
  try {
    const todayISO = req.body?.todayISO || manilaTodayISO();
    const out = await runMonthlyRecurringInvoices({ todayISO });
    res.json({ todayISO, ...out });
  } catch (e) {
    console.error('❌ recurring run failed:', e);
    res.status(500).json({ error: 'Recurring run failed' });
  }
});

module.exports = router;
