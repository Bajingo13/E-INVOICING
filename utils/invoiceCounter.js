'use strict';

const PAD_LEN = 6;

function toBigIntSafe(v) {
  try { return BigInt(v || 0); } catch { return 0n; }
}

// Reads counter row (no lock)
async function getInvoiceCounter(conn) {
  const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
  if (!rows.length) throw new Error('Invoice counter not initialized');
  return rows[0];
}

// Reads counter row with lock (FOR UPDATE) for safe increment
async function getInvoiceCounterForUpdate(conn) {
  const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
  if (!rows.length) throw new Error('Invoice counter not initialized');
  return rows[0];
}

// Compute current max numeric part from invoices table
async function getMaxInvoiceNumber(conn) {
  const [maxRows] = await conn.execute(
    `SELECT MAX(CAST(REGEXP_REPLACE(invoice_no, '^[^0-9]+', '') AS UNSIGNED)) AS max_no
     FROM invoices`
  );
  return toBigIntSafe(maxRows?.[0]?.max_no);
}

// ✅ Preview next invoice no WITHOUT updating last_number (used by /api/next-invoice-no)
async function previewNextInvoiceNo(conn) {
  const counter = await getInvoiceCounter(conn);

  // manual mode -> don’t generate
  if (String(counter.numbering_mode) === 'manual') {
    return { mode: 'manual', invoiceNo: '', prefix: counter.prefix || 'INV-' };
  }

  const maxInvoice = await getMaxInvoiceNumber(conn);
  const lastNumber = toBigIntSafe(counter.last_number);
  const nextNumber = (maxInvoice > lastNumber ? maxInvoice : lastNumber) + 1n;

  const invoiceNo = `${counter.prefix || 'INV-'}${String(nextNumber).padStart(PAD_LEN, '0')}`;
  return { mode: 'auto', invoiceNo, prefix: counter.prefix || 'INV-' };
}

// ✅ Generate + increment last_number (used on CREATE only, auto mode only)
async function generateInvoiceNo(conn) {
  const counter = await getInvoiceCounterForUpdate(conn);

  if (String(counter.numbering_mode) === 'manual') {
    throw new Error('Numbering mode is manual; invoice_no must be provided by client.');
  }

  const maxInvoice = await getMaxInvoiceNumber(conn);
  const lastNumber = toBigIntSafe(counter.last_number);

  const nextNumber = (maxInvoice > lastNumber ? maxInvoice : lastNumber) + 1n;
  const invoiceNo = `${counter.prefix || 'INV-'}${String(nextNumber).padStart(PAD_LEN, '0')}`;

  await conn.execute(
    'UPDATE invoice_counter SET last_number = ? WHERE id = ?',
    [nextNumber.toString(), counter.id]
  );

  return invoiceNo;
}

module.exports = {
  generateInvoiceNo,
  previewNextInvoiceNo,
  getInvoiceCounter
};
