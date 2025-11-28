// routes/company.js
const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asynchandler');
const companyCtrl = require('../controllers/companyController');

// Get company info (keeps compatibility with old endpoint /get-company-info and new /api/company-info)
router.get('/get-company-info', asyncHandler(companyCtrl.getCompanyInfo));
router.get('/api/company-info', asyncHandler(companyCtrl.getCompanyInfo));

// Save / update company info (supports multipart with logo via files route OR multipart here)
router.post('/save-company-info', asyncHandler(companyCtrl.saveCompanyInfo));
router.post('/api/company-info', asyncHandler(companyCtrl.saveCompanyInfo));

module.exports = router;
