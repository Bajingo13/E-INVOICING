'use strict';

function getBaseUrlFromEnvOrReq(req) {
  // Prefer explicit APP_BASE_URL for Railway (stable)
  const envBase = String(process.env.APP_BASE_URL || '').trim();
  if (envBase) return envBase.replace(/\/+$/, '');

  // fallback: derive from request (works if proxy headers are correct)
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host'))
    .split(',')[0]
    .trim();

  return `${proto}://${host}`;
}

async function fetchInvoicePdfBuffer({ invoiceNo, req }) {
  const baseUrl = getBaseUrlFromEnvOrReq(req);
  const url = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceNo)}/pdf?disposition=attachment&filename=${encodeURIComponent(`Invoice-${invoiceNo}.pdf`)}`;

  const headers = {};
  // Forward session cookie so Replica.html can call protected APIs
  if (req?.headers?.cookie) headers.cookie = req.headers.cookie;

  const res = await fetch(url, { method: 'GET', headers });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PDF fetch failed: ${res.status} ${res.statusText} ${t}`.slice(0, 400));
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

module.exports = { fetchInvoicePdfBuffer };
