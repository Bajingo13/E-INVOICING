const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asynchandler');
const companyCtrl = require('../controllers/companyController');

// Get company info
router.get('/', asyncHandler(companyCtrl.getCompanyInfo));

// Save / update company info
router.post('/', asyncHandler(companyCtrl.saveCompanyInfo));

module.exports = router;
