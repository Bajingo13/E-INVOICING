'use strict';

const ExcelJS = require('exceljs');
const { getConn } = require('../helpers/db');

async function exportInvoicesExcel(req, res) {
  const conn = await getConn();
  const status = req.query.status || 'all';

  try {
    let whereClause = '';
    let params = [];

    if (status !== 'all') {
      whereClause = 'WHERE i.status = ?';
      params.push(status);
    }

    const [rows] = await conn.execute(`
      SELECT
        'SJ' AS JOURNAL_CD,
        i.invoice_no AS SA_NO,
        'SALES' AS BOOK_CD,
        i.date AS DATE,
        ts.total_payable AS VOUCH_AMT,
        ts.vatable_sales AS BASEDRATE,
        i.bill_to AS PERNAME,
        i.status AS STATUS,
        NULL AS SI_NO,
        NULL AS PO_NO,
        i.terms AS TERMS,
        NULL AS NO_DAYS,
        ts.total_payable AS VOUCH_AMT1,
        1 AS EXRATE,
        ts.total_payable AS NCV,
        i.bill_to AS CLIENT_CD,
        NULL AS RR_NO,
        'PHP' AS CURRENCYNM,
        NULL AS CHK_DT,
        it.account_id AS AR_CODE,
        it.account_id AS SALES_CD,
        NULL AS PRJ_CD,
        NULL AS DEPT_CD,
        it.description AS PARTIC,
        ts.vat_amount AS OUTPUTVAT
      FROM invoices i
      JOIN invoice_items it ON it.invoice_id = i.id
      LEFT JOIN invoice_tax_summary ts ON ts.invoice_id = i.id
      ${whereClause}
      ORDER BY i.date, i.invoice_no
    `, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice Export');

    worksheet.columns = [
      { header: 'JOURNAL_CD', key: 'JOURNAL_CD' },
      { header: 'SA_NO', key: 'SA_NO' },
      { header: 'BOOK_CD', key: 'BOOK_CD' },
      { header: 'DATE', key: 'DATE' },
      { header: 'VOUCH_AMT', key: 'VOUCH_AMT' },
      { header: 'BASEDRATE', key: 'BASEDRATE' },
      { header: 'PERNAME', key: 'PERNAME' },
      { header: 'STATUS', key: 'STATUS' },
      { header: 'SI_NO', key: 'SI_NO' },
      { header: 'PO_NO', key: 'PO_NO' },
      { header: 'TERMS', key: 'TERMS' },
      { header: 'NO_DAYS', key: 'NO_DAYS' },
      { header: 'VOUCH_AMT1', key: 'VOUCH_AMT1' },
      { header: 'EXRATE', key: 'EXRATE' },
      { header: 'NCV', key: 'NCV' },
      { header: 'CLIENT_CD', key: 'CLIENT_CD' },
      { header: 'RR_NO', key: 'RR_NO' },
      { header: 'CURRENCYNM', key: 'CURRENCYNM' },
      { header: 'CHK_DT', key: 'CHK_DT' },
      { header: 'AR_CODE', key: 'AR_CODE' },
      { header: 'SALES_CD', key: 'SALES_CD' },
      { header: 'PRJ_CD', key: 'PRJ_CD' },
      { header: 'DEPT_CD', key: 'DEPT_CD' },
      { header: 'PARTIC', key: 'PARTIC' },
      { header: 'OUTPUTVAT', key: 'OUTPUTVAT' }
    ];

    worksheet.addRows(rows);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Invoice_Export.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Invoice export failed:', err);
    res.status(500).json({ error: 'Failed to export invoices' });
  } finally {
    conn.release();
  }
}

module.exports = { exportInvoicesExcel };
