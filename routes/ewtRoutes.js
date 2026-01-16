const express = require('express');
const router = express.Router();
const multer = require('multer');
const ewtController = require('../controllers/ewtController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', ewtController.getAllEWT);
router.post('/', ewtController.createEWT);
router.put('/:id', ewtController.updateEWT);
router.delete('/:id', ewtController.deleteEWT);

/* ✅ IMPORT ROUTE */
router.post('/import', upload.single('file'), ewtController.importEWT);

module.exports = router;
