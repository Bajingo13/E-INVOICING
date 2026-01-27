'use strict';

const express = require('express');
const router = express.Router();

const asyncHandler = require('../middleware/asynchandler');
const { pool } = require('../helpers/db');

const invoicesCtrl = require('../controllers/invoicesController');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const { getApprovers } = require('../utils/getApprovers');

/* =========================
   HELPERS
========================= */
async function loadInvoice(invoiceNo) {
  const [[invoice]] = await pool.query(
    'SELECT invoice_no, status, created_by FROM invoices WHERE invoice_no = ?',
    [invoiceNo]
  );
  return invoice;
}

/* =========================
   GET COMPANY INFO
========================= */
router.get(
  '/get-company-info',
  requireLogin,
  asyncHandler(invoicesCtrl.getCompanyInfo)
);

/* =========================
   NOTIFICATIONS
========================= */
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

/* =========================
   CREATE INVOICE (DRAFT)
========================= */
router.post(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  asyncHandler(invoicesCtrl.createInvoice)
);

/* =========================
   UPDATE INVOICE (DRAFT ONLY)
========================= */
router.put(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({
        error: 'Only draft invoices can be edited'
      });
    }

    return invoicesCtrl.updateInvoice(req, res);
  })
);

/* =========================
   SUBMIT INVOICE (SUBMITTER)
======================== */
router.post(
  '/invoices/:invoiceNo/submit',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SUBMIT),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be submitted' });
    }

    await pool.query(
      'UPDATE invoices SET status = "submitted" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    // ---- NOTIFICATIONS ----
    const approvers = await getApprovers();

    // Add Admins + Super Admin
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role IN ('admin', 'super_admin', 'super')`
    );

    const recipients = [
      ...approvers,
      ...admins
    ];

    // avoid duplicates
    const uniqueIds = [...new Set(recipients.map(u => u.id))];

    for (const userId of uniqueIds) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, reference_no, message)
         VALUES (?, 'INVOICE_SUBMITTED', ?, ?)`,
        [
          userId,
          invoice.invoice_no,
          `Invoice ${invoice.invoice_no} is pending your approval`
        ]
      );
    }

    res.json({ message: 'Invoice submitted for approval' });
  })
);

/* =========================
   APPROVE INVOICE (APPROVER)
======================== */
router.post(
  '/invoices/:invoiceNo/approve',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_APPROVE),
  asyncHandler(async (req, res) => {
    const invoiceNo = req.params.invoiceNo;
    const invoice = await loadInvoice(invoiceNo);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'submitted') {
      return res.status(400).json({
        error: 'Only submitted invoices can be approved'
      });
    }

    // Prevent self-approval
    if (invoice.created_by === req.session.user.id) {
      return res.status(403).json({
        error: 'You cannot approve your own invoice'
      });
    }

    await pool.query(
      'UPDATE invoices SET status = "approved" WHERE invoice_no = ?',
      [invoiceNo]
    );

    // ---- NOTIFICATIONS ----
    await pool.query(
      `INSERT INTO notifications (user_id, type, reference_no, message)
       VALUES (?, 'INVOICE_APPROVED', ?, ?)`,
      [
        invoice.created_by,
        invoice.invoice_no,
        `Your invoice ${invoice.invoice_no} has been approved.`
      ]
    );

    res.json({ message: 'Invoice approved successfully' });
  })
);

/* =========================
   GET SINGLE INVOICE
======================== */
router.get(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_VIEW),
  asyncHandler(invoicesCtrl.getInvoice)
);

/* =========================
   LIST INVOICES
======================== */
router.get(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_LIST),
  asyncHandler(invoicesCtrl.listInvoices)
);

/* =========================
   DELETE INVOICE (DRAFT ONLY)
======================== */
router.delete(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_DELETE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({
        error: 'Only draft invoices can be deleted'
      });
    }

    // This will delete invoice + related tables
    return invoicesCtrl.deleteInvoice(req, res);
  })
);


/* =========================
   NEXT INVOICE NUMBER
======================== */
router.get(
  '/next-invoice-no',
  requireLogin,
  asyncHandler(invoicesCtrl.nextInvoiceNo)
);

module.exports = router;
