/**
 * routes/invoicePreviewPdfPuppeteer.routes.js
 *
 * Mounted as:
 *   app.use('/api/invoices', router)
 *
 * GET  /api/invoices/:invoiceNo/pdf
 */

'use strict';

const express = require('express');
const router = express.Router();

// Use puppeteer or puppeteer-core depending on your setup
// If you're using puppeteer-core, ensure executablePath is configured elsewhere
const puppeteer = require('puppeteer'); // or require('puppeteer-core')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();

  const host = (req.headers['x-forwarded-host'] || req.get('host'))
    .split(',')[0]
    .trim();

  return `${proto}://${host}`;
}

async function launchBrowser() {
  // ✅ Stable args for both local Windows dev and Railway Linux
  // NOTE: DO NOT use --single-process on Windows; it commonly crashes.
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
    ],
  });
}

async function waitForReplicaReady(page, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await page.evaluate(() => Boolean(window.__REPLICA_READY));
      if (ready) return true;
    } catch (_) {}
    await sleep(250);
  }
  return false;
}

/* =========================================================
   GET /api/invoices/:invoiceNo/pdf
========================================================= */
router.get('/:invoiceNo/pdf', async (req, res) => {
  let browser;

  const invoiceNo = String(req.params.invoiceNo || '').trim();
  const disposition = (req.query.disposition || 'inline').toString(); // inline | attachment
  const filename = (req.query.filename || `Invoice-${invoiceNo}.pdf`).toString();

  if (!invoiceNo) {
    return res.status(400).json({ error: 'invoiceNo is required' });
  }

  try {
    const baseUrl = getBaseUrl(req);
    const targetUrl = `${baseUrl}/Replica.html?invoice_no=${encodeURIComponent(invoiceNo)}&print=1`;

    console.log('🧭 Puppeteer baseUrl:', baseUrl);
    console.log('🧾 Puppeteer targetUrl:', targetUrl);

    browser = await launchBrowser();
    const page = await browser.newPage();

    // ✅ Forward cookies so Replica.html can call protected APIs
    if (req.headers.cookie) {
      await page.setExtraHTTPHeaders({ cookie: req.headers.cookie });
    }

    // ✅ Prevent the page from closing itself (common when print=1 triggers window.print/close)
    await page.evaluateOnNewDocument(() => {
      // block print/close so Puppeteer target doesn't close
      window.print = () => {};
      window.close = () => {};
      // some apps use self.close()
      if (window.self) window.self.close = () => {};
    });

    // ✅ Dismiss any dialogs just in case
    page.on('dialog', async (d) => {
      try { await d.dismiss(); } catch (_) {}
    });

    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    page.on('console', (msg) => {
      console.log(`🧩 [Replica console:${msg.type()}]`, msg.text());
    });
    page.on('pageerror', (err) => console.error('🧨 [Replica pageerror]', err));
    page.on('requestfailed', (r) => {
      console.error('🚫 [requestfailed]', r.url(), r.failure()?.errorText);
    });
    page.on('close', () => console.error('⚠️ Puppeteer page CLOSED unexpectedly'));
    page.on('error', (e) => console.error('⚠️ Puppeteer page ERROR:', e));

    // Navigate
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Wait until your Replica signals ready
    const ready = await waitForReplicaReady(page, 45000);
    if (!ready) {
      const currentUrl = page.url();
      console.error('❌ Replica did not become ready in time.');
      console.error('📌 Current URL:', currentUrl);
      return res.status(500).json({
        error: 'Replica did not signal ready (window.__REPLICA_READY). Check Replica.js fetch/API + auth/cookies.',
        currentUrl,
      });
    }

    // Optional: give the browser a beat to finish layout/fonts
    await sleep(300);

    // Print PDF
    const pdfBuffer = await page.pdf({
      format: 'letter',          // change to 'A4' if you want
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${String(filename).replace(/"/g, '')}"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('❌ Invoice PDF GET error:', err);
    return res.status(500).json({ error: err.message || 'PDF generation failed' });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
});

module.exports = router;
