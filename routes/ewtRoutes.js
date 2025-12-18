const express = require('express');
const router = express.Router();
const ewtController = require('../controllers/ewtController');

router.get('/', ewtController.getAllEWT);
router.post('/', ewtController.createEWT);
router.put('/:id', ewtController.updateEWT);
router.delete('/:id', ewtController.deleteEWT);

module.exports = router;
