'use strict';

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildInvoiceEmail({ invoiceNo, billTo, companyName, message }) {
  const safeMsg = message ? `<p style="margin:0 0 12px 0;">${escapeHtml(message)}</p>` : '';
  const title = `Invoice ${invoiceNo}`;

  const html = `
  <div style="font-family:Arial,sans-serif; font-size:14px; color:#111; line-height:1.5">
    <h2 style="margin:0 0 8px 0;">${escapeHtml(companyName || 'Invoice')}</h2>
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(billTo || 'Customer')},</p>
    ${safeMsg}
    <p style="margin:0 0 12px 0;">
      Please find attached <b>${escapeHtml(title)}</b>.
    </p>
    <p style="margin:0; color:#555; font-size:12px;">
      This email was sent by our billing system.
    </p>
  </div>`;

  const text = `Hi ${billTo || 'Customer'},\n\n${message ? message + '\n\n' : ''}Please find attached Invoice ${invoiceNo}.\n`;

  return { html, text, subject: title };
}

module.exports = { buildInvoiceEmail };
