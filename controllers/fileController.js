// controllers/fileController.js
const path = require('path');

async function uploadLogo(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const relative = `/uploads/${req.file.filename}`;
  res.json({ filename: relative, message: 'Logo uploaded successfully' });
}

module.exports = { uploadLogo };
