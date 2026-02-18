'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const asyncHandler = require('../middleware/asynchandler');
const { pool } = require('../helpers/db');

const invoicesCtrl = require('../controllers/invoicesController');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const { exportInvoicesExcel } = require('../controllers/invoiceExportController');
const { getApprovers } = require('../utils/getApprovers');
const { logAudit } = require('../helpers/audit');

const { buildInvoiceEmail } = require('../services/invoiceEmailTemplate');
const { fetchInvoicePdfBuffer } = require('../services/pdfFetch');
const { queueEmail } = require('../services/emailOutboxService');

// ---------------- HELPERS ----------------
async function loadInvoice(invoiceNo) {
  const [[invoice]] = await pool.query(
    'SELECT * FROM invoices WHERE invoice_no = ?',
    [invoiceNo]
  );
  return invoice;
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip;
}

// Build a stable signing snapshot (used for signature_hash)
async function buildInvoiceSnapshotForHash(invoice) {
  // NOTE: adjust columns if your invoice_items schema differs
  const [items] = await pool.query(
    `SELECT description, quantity, unit_price, amount
     FROM invoice_items
     WHERE invoice_id = ?
     ORDER BY id ASC`,
    [invoice.id]
  );

  const [[tax]] = await pool.query(
    `SELECT *
     FROM invoice_tax_summary
     WHERE invoice_id = ?
     LIMIT 1`,
    [invoice.id]
  );

  // Keep snapshot stable and minimal (avoid volatile fields like updated_at)
  const snapshot = {
    invoice_no: invoice.invoice_no,
    invoice_type: invoice.invoice_type,
    invoice_category: invoice.invoice_category,
    invoice_mode: invoice.invoice_mode,
    bill_to: invoice.bill_to,
    address: invoice.address,
    tin: invoice.tin,
    terms: invoice.terms,
    date: invoice.date,
    due_date: invoice.due_date,
    currency: invoice.currency,
    exchange_rate: invoice.exchange_rate,
    total_amount_due: invoice.total_amount_due,
    foreign_total: invoice.foreign_total,
    status: invoice.status,
    extra_columns: invoice.extra_columns,
    items: items || [],
    tax_summary: tax || {}
  };

  return JSON.stringify(snapshot);
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

// ---------------- UPDATE INVOICE ----------------
// Approver/Admin can edit ANY invoice
// Submitter (owner) can edit: draft/returned/pending
router.put(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_EDIT),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const role = String(req.session.user.role || '').toLowerCase();
    const userId = req.session.user.id;

    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
    const isApprover = role === 'approver';
    const isOwner = Number(invoice.created_by) === Number(userId);

    // ✅ LOCK ENFORCEMENT: only admins can edit signed/locked invoices
    if (Number(invoice.is_locked_after_sign) === 1 && !isAdmin) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    if (isAdmin || isApprover) {
      return invoicesCtrl.updateInvoice(req, res);
    }

    if (isOwner && ['draft', 'returned', 'pending'].includes(String(invoice.status || '').toLowerCase())) {
      return invoicesCtrl.updateInvoice(req, res);
    }

    return res.status(403).json({ error: 'You are not allowed to edit this invoice' });
  })
);

// ---------------- SUBMIT INVOICE → PENDING (DRAFT OR RETURNED) ----------------
router.post(
  '/invoices/:invoiceNo/submit',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_SUBMIT),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ prevent submit if locked
    if (Number(invoice.is_locked_after_sign) === 1) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const currentStatus = String(invoice.status || '').toLowerCase();
    if (!['draft', 'returned'].includes(currentStatus)) {
      return res.status(400).json({ error: 'Only draft or returned invoices can be submitted' });
    }

    const role = String(req.session.user.role || '').toLowerCase();
    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);

    if (Number(invoice.created_by) !== Number(req.session.user.id) && !isAdmin) {
      return res.status(403).json({ error: 'You cannot submit this invoice' });
    }

    await pool.query(
      'UPDATE invoices SET status = "pending" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    await logAudit(pool, req, {
      action: 'invoice.submit',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Submitted invoice ${invoice.invoice_no} (${currentStatus} → pending)`,
      success: 1,
      before: { status: currentStatus },
      after: { status: 'pending' }
    });

    // Notify approvers + admins
    const approvers = await getApprovers();
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role IN ('admin','super','super_admin')`
    );
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

    // ✅ prevent approve if locked (shouldn't happen, but safe)
    if (Number(invoice.is_locked_after_sign) === 1) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const status = String(invoice.status || '').toLowerCase();
    if (status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invoices can be approved' });
    }

    const role = String(req.session.user.role || '').toLowerCase();

    // ✅ Allowed roles (self-approval allowed)
    const canApproveRole = ['approver', 'admin', 'super', 'super_admin'].includes(role);
    if (!canApproveRole) {
      return res.status(403).json({ error: 'You are not allowed to approve this invoice' });
    }

    await pool.query(
      'UPDATE invoices SET status = "approved" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    await logAudit(pool, req, {
      action: 'invoice.approve',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Approved invoice ${invoice.invoice_no} (pending → approved)`,
      success: 1,
      before: { status: 'pending' },
      after: { status: 'approved' }
    });

    await pool.query(
      `INSERT INTO notifications (user_id, type, reference_no, message)
       VALUES (?, 'INVOICE_APPROVED', ?, ?)`,
      [
        invoice.created_by,
        invoice.invoice_no,
        `Your invoice ${invoice.invoice_no} has been approved`
      ]
    );

    res.json({ message: 'Invoice approved successfully' });
  })
);

// ---------------- ✅ E-SIGN INVOICE (APPROVED ONLY) ----------------
router.post(
  '/invoices/:invoiceNo/signature',
  requireLogin,
  // Reuse approve permission (or create PERMISSIONS.INVOICE_SIGN later)
  requirePermission(PERMISSIONS.INVOICE_APPROVE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const status = String(invoice.status || '').toLowerCase();
    if (status !== 'approved') {
      return res.status(400).json({ error: 'Only approved invoices can be signed' });
    }

    if (Number(invoice.is_locked_after_sign) === 1 || invoice.signed_at || invoice.signature_image) {
      return res.status(409).json({ error: 'Invoice already signed/locked' });
    }

    const { signatureImage, signatureName } = req.body || {};
    const img = String(signatureImage || '');
    const name = String(signatureName || '').trim();

    if (!img.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Invalid signature image (must be PNG data URL)' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Signer name is required' });
    }

    const ip = getClientIp(req);

    // ✅ build hash snapshot
    const snapshotStr = await buildInvoiceSnapshotForHash(invoice);
    const signatureHash = sha256(snapshotStr);

    await pool.query(
      `UPDATE invoices
       SET signed_by_user_id = ?,
           signed_at = NOW(),
           signature_image = ?,
           signature_name = ?,
           signature_ip = ?,
           signature_hash = ?,
           is_locked_after_sign = 1
       WHERE invoice_no = ?`,
      [
        req.session.user.id,
        img,
        name,
        ip,
        signatureHash,
        invoice.invoice_no
      ]
    );

    await logAudit(pool, req, {
      action: 'invoice.sign',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Signed invoice ${invoice.invoice_no}`,
      success: 1,
      before: {
        signed_at: null,
        is_locked_after_sign: 0
      },
      after: {
        signed_at: 'NOW()',
        is_locked_after_sign: 1
      },
      meta: {
        signature_name: name,
        signature_ip: ip,
        signature_hash: signatureHash
      }
    });

    res.json({ message: 'Invoice signed successfully', signature_hash: signatureHash });
  })
);

// ---------------- EMAIL INVOICE (APPROVED OR PENDING) ----------------
router.post(
  '/invoices/:invoiceNo/email',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_VIEW), // or create PERMISSIONS.INVOICE_EMAIL
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { to, subject, message } = req.body || {};
    const emailTo = String(to || '').trim();
    if (!emailTo) return res.status(400).json({ error: 'Missing "to" email' });

    const { subject: defaultSubject, html, text } = buildInvoiceEmail({
      invoiceNo: invoice.invoice_no,
      billTo: invoice.bill_to,
      companyName: 'Your Company',
      message
    });

    const pdfBuffer = await fetchInvoicePdfBuffer({ invoiceNo: invoice.invoice_no, req });

    const attachments = [
      {
        filename: `Invoice-${invoice.invoice_no}.pdf`,
        contentType: 'application/pdf',
        dataBase64: pdfBuffer.toString('base64')
      }
    ];

    await queueEmail({
      type: 'invoice',
      referenceNo: invoice.invoice_no,
      to: emailTo,
      subject: subject || defaultSubject,
      html,
      text,
      attachments,
      createdBy: req.session.user?.id || null
    });

    await logAudit(pool, req, {
      action: 'invoice.email',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Queued invoice ${invoice.invoice_no} email to ${emailTo}`,
      success: 1,
      meta: { to: emailTo, subject: subject || defaultSubject }
    });

    res.json({ message: 'Email queued (will send shortly).' });
  })
);

// ---------------- RETURN INVOICE ----------------
router.post(
  '/invoices/:invoiceNo/return',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_APPROVE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ prevent return if locked
    if (Number(invoice.is_locked_after_sign) === 1) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const status = String(invoice.status || '').toLowerCase();
    if (status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invoices can be returned' });
    }

    const role = String(req.session.user.role || '').toLowerCase();
    const canReturnRole = ['approver', 'admin', 'super', 'super_admin'].includes(role);
    if (!canReturnRole) {
      return res.status(403).json({ error: 'You are not allowed to return this invoice' });
    }

    const reason = String(req.body?.reason || '').trim();

    await pool.query(
      'UPDATE invoices SET status = "returned" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    await logAudit(pool, req, {
      action: 'invoice.return',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: reason
        ? `Returned invoice ${invoice.invoice_no} (reason: ${reason})`
        : `Returned invoice ${invoice.invoice_no}`,
      success: 1,
      before: { status: 'pending' },
      after: { status: 'returned' },
      meta: reason ? { reason } : null
    });

    res.json({ message: 'Invoice returned successfully' });
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

    // ✅ prevent mark-paid if locked (optional rule; remove if you want)
    if (Number(invoice.is_locked_after_sign) === 1) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const status = String(invoice.status || '').toLowerCase();
    if (status !== 'approved') return res.status(400).json({ error: 'Only approved invoices can be marked as paid' });

    const role = String(req.session.user.role || '').toLowerCase();
    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
    if (!isAdmin) return res.status(403).json({ error: 'You are not allowed to mark this invoice as paid' });

    await pool.query(
      'UPDATE invoices SET status = "paid" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    await logAudit(pool, req, {
      action: 'invoice.mark_paid',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Marked invoice ${invoice.invoice_no} as paid (approved → paid)`,
      success: 1,
      before: { status: 'approved' },
      after: { status: 'paid' }
    });

    res.json({ message: 'Invoice marked as paid' });
  })
);

// ---------------- VOID INVOICE ----------------
router.post(
  '/invoices/:invoiceNo/void',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_VOID),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const status = String(invoice.status || '').toLowerCase();
    if (!['draft', 'returned', 'pending', 'approved'].includes(status)) {
      return res.status(400).json({ error: 'Only draft, returned, pending, or approved invoices can be voided' });
    }

    const role = String(req.session.user?.role || '').toLowerCase();
    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
    const isApprover = role === 'approver';

    // ✅ LOCK ENFORCEMENT: only admins can void signed/locked invoices
    if (Number(invoice.is_locked_after_sign) === 1 && !isAdmin) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const canVoid = (role === 'super' || isApprover || isAdmin);
    if (!canVoid) return res.status(403).json({ error: 'You are not allowed to void this invoice' });

    await pool.query(
      'UPDATE invoices SET status = "void" WHERE invoice_no = ?',
      [invoice.invoice_no]
    );

    await logAudit(pool, req, {
      action: 'invoice.void',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Voided invoice ${invoice.invoice_no} (${status} → void)`,
      success: 1,
      before: { status },
      after: { status: 'void' }
    });

    res.json({ message: 'Invoice voided successfully' });
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
  asyncHandler((req, res) => invoicesCtrl.listInvoices(req, res))
);

// ---------------- EXPORT INVOICES ----------------
router.get(
  '/invoices/export/excel',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_EXPORT),
  asyncHandler(async (req, res) => {
    await logAudit(pool, req, {
      action: 'invoice.export.excel',
      entity_type: 'invoice',
      entity_id: null,
      summary: 'Exported invoice list (Excel)',
      success: 1
    });

    return exportInvoicesExcel(req, res);
  })
);

// ---------------- DELETE INVOICE (DRAFT OR RETURNED) ----------------
router.delete(
  '/invoices/:invoiceNo',
  requireLogin,
  requirePermission(PERMISSIONS.INVOICE_DELETE),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.params.invoiceNo);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // ✅ LOCK ENFORCEMENT: deny delete if signed/locked (admins can override if you want)
    const role = String(req.session.user.role || '').toLowerCase();
    const isAdmin = ['super', 'admin', 'super_admin'].includes(role);
    if (Number(invoice.is_locked_after_sign) === 1 && !isAdmin) {
      return res.status(409).json({ error: 'Invoice is locked because it is signed.' });
    }

    const status = String(invoice.status || '').toLowerCase();
    if (!['draft', 'returned'].includes(status)) {
      return res.status(400).json({ error: 'Only draft or returned invoices can be deleted' });
    }

    if (Number(invoice.created_by) !== Number(req.session.user.id) && !isAdmin) {
      return res.status(403).json({ error: 'You cannot delete this invoice' });
    }

    await logAudit(pool, req, {
      action: 'invoice.delete.request',
      entity_type: 'invoice',
      entity_id: invoice.invoice_no,
      summary: `Delete requested for invoice ${invoice.invoice_no}`,
      success: 1,
      before: { status }
    });

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
router.get(
  '/exchange-rate',
  requireLogin,
  asyncHandler(async (req, res) => {
    const to = String(req.query.to || '').toUpperCase().trim();
    if (!to) return res.status(400).json({ error: 'Missing currency code' });

    const fallbackRates = { USD: 56, SGD: 42, AUD: 38, EUR: 60, PHP: 1 };

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
  })
);

module.exports = router;
