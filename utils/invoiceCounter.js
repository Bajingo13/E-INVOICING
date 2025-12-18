'use strict';
const { getConn } = require('../db/pool');

/**
 * Generate the next invoice number safely, avoiding duplicates.
 */
async function generateInvoiceNo(conn) {
  // Start a transaction if not already in one
  const [counterRows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
  if (!counterRows.length) throw new Error('Invoice counter not initialized');

  const counter = counterRows[0];

  // Find the highest existing invoice number in the invoices table
  const [maxRows] = await conn.execute(
    `SELECT MAX(CAST(SUBSTRING(invoice_no, ?) AS UNSIGNED)) AS max_no FROM invoices`,
    [counter.prefix.length + 1] // Skip prefix characters
  );
  const maxInvoice = maxRows[0].max_no || 0;

  // Take the higher of counter.last_number or maxInvoice
  const nextNumber = Math.max(counter.last_number || 0, maxInvoice) + 1;
  const invoiceNo = `${counter.prefix}${String(nextNumber).padStart(6, '0')}`;

  // Update the counter atomically
  await conn.execute('UPDATE invoice_counter SET last_number = ? WHERE id = ?', [nextNumber, counter.id]);

  return invoiceNo;
}

module.exports = { generateInvoiceNo };
