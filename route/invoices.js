// routes/invoices.js - invoices endpoints
const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asynchandler');
const invoicesCtrl = require('../controllers/invoicesController');

// Create invoice
router.post('/invoices', asyncHandler(invoicesCtrl.createInvoice));

// Update invoice by invoiceNo (PUT /api/invoices/:invoiceNo)
router.put('/invoices/:invoiceNo', asyncHandler(invoicesCtrl.updateInvoice));

// Get invoice by invoiceNo
router.get('/invoices/:invoiceNo', asyncHandler(invoicesCtrl.getInvoice));

// List invoices (supports ?status=)
router.get('/invoices', asyncHandler(invoicesCtrl.listInvoices));

// Delete invoice
router.delete('/invoices/:invoiceNo', asyncHandler(invoicesCtrl.deleteInvoice));

// Next invoice number
router.get('/next-invoice-no', asyncHandler(invoicesCtrl.nextInvoiceNo));

module.exports = router;
