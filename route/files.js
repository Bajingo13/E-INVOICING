// routes/files.js - handles uploads and static file endpoints
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const asyncHandler = require('../middleware/asynchandler');
const fileCtrl = require('../controllers/fileController');

const uploadFolder = path.join(__dirname, '..', 'public', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    const name = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// upload logo used by frontend earlier at /upload-logo
router.post('/upload-logo', upload.single('logo'), asyncHandler(fileCtrl.uploadLogo));

// If you want company uploads to hit same endpoint:
// router.post('/save-company-info', upload.single('logo'), asyncHandler(companyCtrl.saveCompanyInfo));

module.exports = router;
