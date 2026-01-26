'use strict';

const express = require('express');
const router = express.Router();

const asyncHandler = require('../middleware/asynchandler');
const { pool } = require('../db/pool');

const invoicesCtrl = require('../controllers/invoicesController');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

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
   CREATE INVOICE (DRAFT)
   Submitter / Approver / Super
========================= */
router.post(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_CREATE),
  asyncHandler(invoicesCtrl.createInvoice)
);

/* =========================
   UPDATE INVOICE
   ONLY DRAFT
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
   SUBMIT INVOICE
   Submitter ONLY
========================= */
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

    res.json({ message: 'Invoice submitted for approval' });
  })
);

/* =========================
   APPROVE INVOICE
   Approver ONLY
========================= */
router.post(
  '/invoices/:invoiceNo/approve',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_APPROVE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted invoices can be approved' });
    }

    // 🚫 prevent approving own invoice
    if (invoice.created_by === req.session.user.id) {
      return res.status(403).json({ error: 'You cannot approve your own invoice' });
    }

    await pool.query(
      'UPDATE invoices SET status = "approved" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    res.json({ message: 'Invoice approved' });
  })
);

/* =========================
   GET SINGLE INVOICE
========================= */
router.get(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_VIEW),
  asyncHandler(invoicesCtrl.getInvoice)
);

router.get(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_LIST),
  asyncHandler(invoicesCtrl.listInvoices)
);

/* =========================
   LIST INVOICES
========================= */
router.get(
  '/invoices',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_LIST),
  asyncHandler(invoicesCtrl.listInvoices)
);

/* =========================
   DELETE INVOICE
   ONLY DRAFT
========================= */
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

    await pool.query(
      'DELETE FROM invoices WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    res.json({ message: 'Invoice deleted successfully' });
  })
);

/* =========================
   NEXT INVOICE NUMBER
========================= */
router.get(
  '/next-invoice-no',
  requireLogin,
  asyncHandler(invoicesCtrl.nextInvoiceNo)
);

module.exports = router;
