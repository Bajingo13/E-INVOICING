'use strict';

const cron = require('node-cron');
const { runMonthlyRecurringInvoices } = require('../services/invoiceRecurringMonthly');

// ✅ Manila date string (YYYY-MM-DD) WITHOUT external libs
function manilaTodayISO() {
  // 'en-CA' gives YYYY-MM-DD format reliably
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

function startRecurringJob() {
  // run daily at 01:05 AM (Asia/Manila)
  cron.schedule(
    '5 1 * * *',
    async () => {
      try {
        const todayISO = manilaTodayISO();
        const out = await runMonthlyRecurringInvoices({ todayISO });
        console.log('✅ recurring job:', { todayISO, ...out });
      } catch (e) {
        console.error('❌ recurring job error:', e);
      }
    },
    { timezone: 'Asia/Manila' }
  );

  console.log('✅ Recurring job scheduled: daily 01:05 (Asia/Manila)');
}

module.exports = { startRecurringJob };
