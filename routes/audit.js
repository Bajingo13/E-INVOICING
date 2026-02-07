const express = require('express');
const router = express.Router();
const { getConn } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');

router.get('/', asyncHandler(async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      'SELECT * FROM audit_trail ORDER BY created_at DESC'
    );
    res.json(rows);
  } finally {
    conn.release();
  }
}));

module.exports = router;
