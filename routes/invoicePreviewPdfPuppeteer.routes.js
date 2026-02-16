'use strict';

const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * invoicePreviewPdfPuppeteer.routes.js
 *
 * Mounted as:
 *   app.use('/api/invoices', router)
 *
 * So:
 *   POST /api/invoices/pdf
 *   GET  /api/invoices/:invoiceNo/pdf
 *
 * ✅ Updates:
 * - GET route no longer blocks fetch/xhr (your Replica.js NEEDS fetch)
 * - GET route waits for window.__REPLICA_READY set by Replica.js
 * - Avoids networkidle0 (prevents 30s timeout)
 * - Adds cookie forwarding so Replica.html can access protected APIs
 * - Adds better debug logging on failures
 */

/* =========================================================
   POST /api/invoices/pdf  (kept as-is)
========================================================= */
router.post('/pdf', async (req, res) => {
  let browser;

  try {
    const {
      bodyHtml,
      cssText = '',
      headerHtml = '',
      footerHtml = '',
      paperSize = 'letter',
      landscape = false,
      filename = 'Invoice.pdf',
      disposition = 'inline'
    } = req.body || {};

    if (!bodyHtml) {
      return res.status(400).json({ success: false, message: 'Missing bodyHtml' });
    }

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    });

    const page = await browser.newPage();
    try { await page.emulateMediaType('screen'); } catch {}

    const htmlContent = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          ${cssText || ''}
          html, body { margin:0; padding:0; background:#fff; }
          img { max-width: 100%; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
      </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    try {
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          try { await document.fonts.ready; } catch {}
        }
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }));
      });
    } catch {}

    await sleep(150);

    const hasHeaderFooter = Boolean((headerHtml || '').trim() || (footerHtml || '').trim());

    const pdfOptions = {
      format: paperSize,
      landscape: Boolean(landscape),
      printBackground: true,
      displayHeaderFooter: hasHeaderFooter,
      headerTemplate: headerHtml || '<div></div>',
      footerTemplate: footerHtml || '<div></div>',
      margin: hasHeaderFooter
        ? { top: '0.8in', right: '0.4in', bottom: '0.8in', left: '0.4in' }
        : { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      preferCSSPageSize: true
    };

    const pdfBuffer = await page.pdf(pdfOptions);

    const safeDisposition = (disposition === 'attachment') ? 'attachment' : 'inline';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${safeDisposition}; filename="${String(filename || 'Invoice.pdf').replace(/"/g, '')}"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error('Invoice PDF POST error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: err.message
    });
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
});


/* =========================================================
   GET /api/invoices/:invoiceNo/pdf
   (Chrome PDF viewer toolbar inside iframe)
========================================================= */
router.get('/:invoiceNo/pdf', async (req, res) => {
  let browser;

  try {
    const invoiceNo = String(req.params.invoiceNo || '').trim();
    if (!invoiceNo) return res.status(400).send('Missing invoice number');

    const disposition = (req.query.disposition === 'attachment') ? 'attachment' : 'inline';
    const filename = String(req.query.filename || `Invoice-${invoiceNo}.pdf`).replace(/"/g, '');

    const BASE_URL =
      process.env.PUBLIC_BASE_URL ||
      `http://127.0.0.1:${process.env.PORT || 3000}`;

    // Your Replica.js fetches /api/invoices/:invoiceNo. Also pass print=1 if you want.
    const targetUrl = `${BASE_URL}/Replica.html?invoice_no=${encodeURIComponent(invoiceNo)}&print=1`;

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    });

    const page = await browser.newPage();

    // ✅ Speed/robustness settings
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    try { await page.emulateMediaType('screen'); } catch {}

    // ✅ Forward cookies/session to puppeteer so Replica.html can access protected APIs
    // (Only works if your auth uses cookies; safe if none)
    try {
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map((c) => {
          const idx = c.indexOf('=');
          const name = c.slice(0, idx).trim();
          const value = c.slice(idx + 1).trim();
          return {
            name,
            value,
            domain: new URL(BASE_URL).hostname,
            path: '/'
          };
        });
        await page.setCookie(...cookies);
      }
    } catch {}

    // ✅ DO NOT block fetch/xhr — Replica.js needs it to load invoice data
    // BUT we can block junk like analytics/media if you ever add them
    await page.setRequestInterception(true);
    page.on('request', (reqx) => {
      const type = reqx.resourceType();
      if (type === 'media') return reqx.abort();
      return reqx.continue();
    });

    // ✅ Navigate fast (DON’T use networkidle0)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // ✅ Wait until Replica.js finishes rendering
    // You MUST have: window.__REPLICA_READY=true in Replica.js after render
    await page.waitForFunction(() => window.__REPLICA_READY === true, { timeout: 60000 });

    // ✅ Wait fonts + images (best-effort)
    try {
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          try { await document.fonts.ready; } catch {}
        }
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }));
      });
    } catch {}

    await sleep(120);

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store'
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error('Invoice PDF GET error:', err);

    // ✅ Helpful: log what page is currently showing (auth redirect / error page)
    try {
      if (browser) {
        const pages = await browser.pages();
        const p = pages?.[pages.length - 1];
        if (p) {
          console.error('📌 Current URL:', await p.url());
        }
      }
    } catch {}

    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: err.message
    });
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
});

module.exports = router;
