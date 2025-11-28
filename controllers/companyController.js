// controllers/companyController.js
const { getConn } = require('../db/pool');
const fs = require('fs');
const path = require('path');

async function getCompanyInfo(req, res) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    res.json(rows[0] || {});
  } finally {
    conn.release();
  }
}

/**
 * Expects multipart/form-data if logo uploaded.
 * Fields: company_name, company_address, tel_no, vat_tin
 * File field: logo (optional) - but to keep controller simple we expect file path or base64 string in body if not using multer.
 */
async function saveCompanyInfo(req, res) {
  // If using multer file upload middleware (files route), file will be in req.file
  const { company_name, company_address, tel_no, vat_tin } = req.body;
  let logo_path = null;

  // If an uploaded file was used (handled by files route which sets req.file)
  if (req.file && req.file.path) {
    // store relative url path to public/uploads
    logo_path = `/uploads/${req.file.filename}`;
  } else if (req.body.logo_path) {
    logo_path = req.body.logo_path;
  }

  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT * FROM company_info LIMIT 1');
    if (rows.length > 0) {
      const existingId = rows[0].company_id;
      const newLogo = logo_path || rows[0].logo_path;
      await conn.execute(
        `UPDATE company_info SET company_name=?, company_address=?, tel_no=?, vat_tin=?, logo_path=? WHERE company_id=?`,
        [company_name || rows[0].company_name, company_address || rows[0].company_address, tel_no || rows[0].tel_no, vat_tin || rows[0].vat_tin, newLogo, existingId]
      );
      res.json({ message: 'Company info updated' });
    } else {
      const [result] = await conn.execute(
        `INSERT INTO company_info (company_name, company_address, tel_no, vat_tin, logo_path) VALUES (?, ?, ?, ?, ?)`,
        [company_name || '', company_address || '', tel_no || '', vat_tin || '', logo_path]
      );
      res.json({ message: 'Company info saved', id: result.insertId });
    }
  } finally {
    conn.release();
  }
}

module.exports = { getCompanyInfo, saveCompanyInfo };
