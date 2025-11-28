// utils/invoiceCounter.js
// Helper to safely generate next invoice number using a transaction.
// Expects a table 'invoice_counter' with columns: id, prefix, last_number

async function generateInvoiceNo(conn) {
  // conn must be an active connection (from getConn())
  await conn.beginTransaction();
  try {
    const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1 FOR UPDATE');
    if (!rows || rows.length === 0) throw new Error('Invoice counter not initialized');
    const counter = rows[0];
    const nextNumber = (counter.last_number || 0) + 1;
    const invoiceNo = `${counter.prefix}-${String(nextNumber).padStart(6, '0')}`;
    await conn.execute('UPDATE invoice_counter SET last_number = ? WHERE id = ?', [nextNumber, counter.id]);
    await conn.commit();
    return invoiceNo;
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

module.exports = { generateInvoiceNo };
