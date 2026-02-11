'use strict';

const PAD_LEN = 6;

function toBigIntSafe(v) {
  try { return BigInt(v || 0); } catch { return 0n; }
}

function cleanPrefix(p) {
  const x = String(p || '').trim();
  return x || 'INV-';
}

function buildInvoiceNo(prefix, n) {
  const p = cleanPrefix(prefix);
  return `${p}${String(n).padStart(PAD_LEN, '0')}`;
}

// ✅ Always read the same counter row (avoid id=1 bugs)
async function getInvoiceCounter(conn) {
  const [rows] = await conn.execute(
    'SELECT * FROM invoice_counter ORDER BY id ASC LIMIT 1'
  );
  if (!rows.length) throw new Error('Invoice counter not initialized');
  return rows[0];
}

// ✅ Lock row for update
async function getInvoiceCounterForUpdate(conn) {
  const [rows] = await conn.execute(
    'SELECT * FROM invoice_counter ORDER BY id ASC LIMIT 1 FOR UPDATE'
  );
  if (!rows.length) throw new Error('Invoice counter not initialized');
  return rows[0];
}

// ✅ Collision-only: check exact invoice_no existence
async function invoiceNoExists(conn, invoiceNo) {
  const [rows] = await conn.execute(
    'SELECT 1 FROM invoices WHERE invoice_no = ? LIMIT 1',
    [invoiceNo]
  );
  return rows.length > 0;
}

/**
 * ✅ Preview next invoice no WITHOUT updating last_number (used by /api/next-invoice-no)
 * RULE:
 * - manual mode => return blank
 * - auto mode => next = last_number + 1
 * - if that exact invoice_no exists, keep incrementing until free (collision-only)
 */
async function previewNextInvoiceNo(conn) {
  const counter = await getInvoiceCounter(conn);

  const mode = String(counter.numbering_mode || 'auto').trim().toLowerCase();
  const prefix = cleanPrefix(counter.prefix);
  const lastNumber = toBigIntSafe(counter.last_number);

  if (mode === 'manual') {
    return { mode: 'manual', invoiceNo: '', prefix };
  }

  let nextNumber = lastNumber + 1n;

  // collision-only skip
  for (let i = 0; i < 500; i++) {
    const candidate = buildInvoiceNo(prefix, nextNumber);
    if (!(await invoiceNoExists(conn, candidate))) {
      return { mode: 'auto', invoiceNo: candidate, prefix };
    }
    nextNumber += 1n;
  }

  // fallback (should never happen)
  return { mode: 'auto', invoiceNo: buildInvoiceNo(prefix, lastNumber + 1n), prefix };
}

/**
 * ✅ Generate + increment last_number (used on CREATE only, auto mode only)
 * RULE:
 * - manual mode => throw
 * - auto mode => next = last_number + 1 (skip collisions only)
 * - update invoice_counter.last_number to the number actually used
 */
async function generateInvoiceNo(conn) {
  const counter = await getInvoiceCounterForUpdate(conn);

  const mode = String(counter.numbering_mode || 'auto').trim().toLowerCase();
  if (mode === 'manual') {
    throw new Error('Numbering mode is manual; invoice_no must be provided by client.');
  }

  const prefix = cleanPrefix(counter.prefix);
  const lastNumber = toBigIntSafe(counter.last_number);

  let nextNumber = lastNumber + 1n;

  // collision-only skip
  for (let i = 0; i < 500; i++) {
    const candidate = buildInvoiceNo(prefix, nextNumber);
    if (!(await invoiceNoExists(conn, candidate))) {
      // IMPORTANT: store last_number as the number we used
      await conn.execute(
        'UPDATE invoice_counter SET last_number = ? WHERE id = ?',
        [nextNumber.toString(), counter.id]
      );
      return candidate;
    }
    nextNumber += 1n;
  }

  throw new Error('Unable to generate unique invoice number (too many collisions).');
}

module.exports = {
  generateInvoiceNo,
  previewNextInvoiceNo,
  getInvoiceCounter
};
