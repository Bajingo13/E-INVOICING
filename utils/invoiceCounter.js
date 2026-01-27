'use strict';

async function generateInvoiceNo(conn) {
  const [counterRows] = await conn.execute(
    'SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE'
  );
  if (!counterRows.length) throw new Error('Invoice counter not initialized');

  const counter = counterRows[0];

  const [maxRows] = await conn.execute(
    `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^[^0-9]+', '') AS UNSIGNED)) AS max_no
     FROM invoices`
  );

  const maxInvoice = BigInt(maxRows[0].max_no || 0);
  const lastNumber = BigInt(counter.last_number || 0);

  const nextNumber = (maxInvoice > lastNumber ? maxInvoice : lastNumber) + 1n;

  const invoiceNo = `${counter.prefix}${String(nextNumber).padStart(6, '0')}`;

  await conn.execute(
    'UPDATE invoice_counter SET last_number = ? WHERE id = ?',
    [nextNumber.toString(), counter.id]
  );

  return invoiceNo;
}

module.exports = { generateInvoiceNo };
