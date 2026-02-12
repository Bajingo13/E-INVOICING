const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asynchandler');
const companyCtrl = require('../controllers/companyController');

const multer = require('multer');
const path = require('path');

const uploadFolder = path.join(__dirname, '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const name = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, name);
  }
});

const upload = multer({ storage });

// Get company info
router.get('/', asyncHandler(companyCtrl.getCompanyInfo));

// Save / update company info (multipart/form-data + optional logo)
router.post('/', upload.single('logo'), asyncHandler(companyCtrl.saveCompanyInfo));

module.exports = router;
