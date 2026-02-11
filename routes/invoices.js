// ==================================
// routes/invoices.js (or your router file)
// READY TO PASTE (supports RETURNED status)
// ==================================

'use strict';

const express = require('express');
const router = express.Router();

const asyncHandler = require('../middleware/asynchandler');
const { pool } = require('../helpers/db');

const invoicesCtrl = require('../controllers/invoicesController');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');
const { exportInvoicesExcel } = require('../controllers/invoiceExportController');
const { getApprovers } = require('../utils/getApprovers');

// ---------------- HELPERS ----------------
async function loadInvoice(invoiceNo) {
  const [[invoice]] = await pool.query(
    'SELECT * FROM invoices WHERE invoice_no = ?',
    [invoiceNo]
  );
  return invoice;
}

// ---------------- GET COMPANY INFO ----------------
router.get(
  '/get-company-info',
  requireLogin,
  asyncHandler(invoicesCtrl.getCompanyInfo)
);

// ---------------- NOTIFICATIONS ----------------
router.get(
  '/notifications',
  requireLogin,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.session.user.id]
    );
    res.json(rows);
  })
);

router.post(
  '/notifications/:id/read',
  requireLogin,
  asyncHandler(async (req, res) => {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.session.user.id]
    );
    res.sendStatus(204);
  })
);

// ---------------- CREATE INVOICE (DRAFT) ----------------
router.post(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  asyncHandler(invoicesCtrl.createInvoice)
);

// ---------------- UPDATE INVOICE (DRAFT OR RETURNED) ✅ UPDATED ----------------
router.put(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_EDIT),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // ✅ allow editing returned too
    if (!['draft', 'returned'].includes(invoice.status)) {
      return res.status(400).json({
        error: 'Only draft or returned invoices can be edited'
      });
    }

    return invoicesCtrl.updateInvoice(req, res);
  })
);

// ---------------- SUBMIT INVOICE → PENDING (DRAFT OR RETURNED) ✅ UPDATED ----------------
router.post(
  '/invoices/:invoiceNo/submit',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SUBMIT),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ allow submit from returned too
    if (!['draft', 'returned'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Only draft or returned invoices can be submitted' });
    }

    // Only creator or admin can submit
    if (invoice.created_by !== req.session.user.id && !['super','admin'].includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You cannot submit this invoice' });
    }

    await pool.query('UPDATE invoices SET status = "pending" WHERE invoice_no = ?', [invoice.invoice_no]);

    // Notify approvers + admins
    const approvers = await getApprovers();
    const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('admin','super','super_admin')`);
    const recipients = [...approvers, ...admins];
    const uniqueIds = [...new Set(recipients.map(u => u.id))];

    for (const userId of uniqueIds) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, reference_no, message)
         VALUES (?, 'INVOICE_PENDING', ?, ?)`,
        [userId, invoice.invoice_no, `Invoice ${invoice.invoice_no} is pending your approval`]
      );
    }

    res.json({ message: 'Invoice submitted and set to pending' });
  })
);

// ---------------- APPROVE INVOICE ----------------
router.post(
  '/invoices/:invoiceNo/approve',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_APPROVE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'pending') return res.status(400).json({ error: 'Only pending invoices can be approved' });

    if (invoice.created_by === req.session.user.id) return res.status(403).json({ error: 'You cannot approve your own invoice' });
    if (!['approver','admin','super'].includes(req.session.user.role)) return res.status(403).json({ error: 'You are not allowed to approve this invoice' });

    await pool.query('UPDATE invoices SET status = "approved" WHERE invoice_no = ?', [invoice.invoice_no]);

    await pool.query(
      `INSERT INTO notifications (user_id, type, reference_no, message)
       VALUES (?, 'INVOICE_APPROVED', ?, ?)`,
      [invoice.created_by, invoice.invoice_no, `Your invoice ${invoice.invoice_no} has been approved`]
    );

    res.json({ message: 'Invoice approved successfully' });
  })
);

// ✅ NEW ---------------- RETURN INVOICE (PENDING → RETURNED) ----------------
router.post(
  '/invoices/:invoiceNo/return',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_APPROVE), // or create PERMISSIONS.INVOICE_RETURN
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (invoice.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invoices can be returned' });
    }

    // No self-return
    if (invoice.created_by === req.session.user.id) {
      return res.status(403).json({ error: 'You cannot return your own invoice' });
    }

    // Only approver/admin/super can return
    if (!['approver','admin','super'].includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to return this invoice' });
    }

    const reason = (req.body?.reason || '').trim();

    // ✅ set returned (not draft)
    await pool.query('UPDATE invoices SET status = "returned" WHERE invoice_no = ?', [invoice.invoice_no]);

    // Notify creator
    await pool.query(
      `INSERT INTO notifications (user_id, type, reference_no, message)
       VALUES (?, 'INVOICE_RETURNED', ?, ?)`,
      [
        invoice.created_by,
        invoice.invoice_no,
        reason
          ? `Invoice ${invoice.invoice_no} was returned: ${reason}`
          : `Invoice ${invoice.invoice_no} was returned for revision`
      ]
    );

    res.json({ message: 'Invoice returned to submitter (returned)' });
  })
);

// ---------------- MARK PAID ----------------
router.post(
  '/invoices/:invoiceNo/mark-paid',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_PAY),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'approved') return res.status(400).json({ error: 'Only approved invoices can be marked as paid' });

    if (!['super','admin'].includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to mark this invoice as paid' });
    }

    await pool.query('UPDATE invoices SET status = "paid" WHERE invoice_no = ?', [invoice.invoice_no]);
    res.json({ message: 'Invoice marked as paid' });
  })
);

// ---------------- CANCEL INVOICE (DRAFT/RETURNED/PENDING) ✅ UPDATED ----------------
router.post(
  '/invoices/:invoiceNo/cancel',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_CANCEL),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ include returned
    if (!['draft','returned','pending'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Only draft, returned, or pending invoices can be canceled' });
    }

    if (!['super','admin'].includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to cancel this invoice' });
    }

    await pool.query('UPDATE invoices SET status = "canceled" WHERE invoice_no = ?', [invoice.invoice_no]);
    res.json({ message: 'Invoice canceled successfully' });
  })
);

// ---------------- GET SINGLE INVOICE ----------------
router.get(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_VIEW),
  asyncHandler(invoicesCtrl.getInvoice)
);

// ---------------- LIST INVOICES ----------------
router.get(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_LIST),
  asyncHandler(invoicesCtrl.listInvoices)
);

// ---------------- EXPORT INVOICES ----------------
router.get(
  '/invoices/export/excel',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_EXPORT),
  asyncHandler(exportInvoicesExcel)
);

// ---------------- DELETE INVOICE (DRAFT OR RETURNED) ✅ UPDATED ----------------
router.delete(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_DELETE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ allow delete for returned too (optional but recommended)
    if (!['draft','returned'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Only draft or returned invoices can be deleted' });
    }

    if (invoice.created_by !== req.session.user.id && !['super','admin'].includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You cannot delete this invoice' });
    }

    return invoicesCtrl.deleteInvoice(req, res);
  })
);

// ---------------- NEXT INVOICE NUMBER ----------------
router.get(
  '/next-invoice-no',
  requireLogin,
  asyncHandler(invoicesCtrl.nextInvoiceNo)
);

// ---------------- GET EXCHANGE RATE (BAP) ----------------
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

router.get('/exchange-rate', requireLogin, asyncHandler(async (req, res) => {
  const to = req.query.to?.toUpperCase();
  if (!to) return res.status(400).json({ error: 'Missing currency code' });

  const fallbackRates = { USD: 56, SGD: 42, AUD: 38, PHP: 1 };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://www.bap.org.ph/downloads/daily-rates.json', {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error('BAP source not available');

    const data = await response.json();

    if (to === 'PHP') return res.json({ rate: 1 });

    const rate = Number(data[to]) || fallbackRates[to];
    if (!rate) return res.status(404).json({ error: 'Exchange rate unavailable' });

    const note = data[to] ? undefined : 'Using fallback rate';
    res.json({ rate, note });

  } catch (err) {
    console.error('Exchange rate error:', err);
    const rate = fallbackRates[to];
    if (!rate) return res.status(500).json({ error: 'Exchange rate unavailable' });
    res.json({ rate, note: 'Using fallback rate' });
  }
}));

module.exports = router;
