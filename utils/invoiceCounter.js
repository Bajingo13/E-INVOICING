async function generateInvoiceNo(conn) {
  const [rows] = await conn.execute('SELECT * FROM invoice_counter LIMIT 1');
  if (!rows.length) throw new Error('Invoice counter not initialized');

  const counter = rows[0];
  const nextNumber = (counter.last_number || 0) + 1;
  const invoiceNo = `${counter.prefix}-${String(nextNumber).padStart(6, '0')}`;

  await conn.execute('UPDATE invoice_counter SET last_number = ? WHERE id = ?', [nextNumber, counter.id]);

  return invoiceNo;
}

module.exports = { generateInvoiceNo };
