const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// === API ROUTES ===

// Save invoice data to JSON file (or DB later)
app.post('/invoice', (req, res) => {
  const invoiceData = req.body;

  // Simple save to file
  const filename = `invoice-${Date.now()}.json`;
  const filepath = path.join(__dirname, 'invoices', filename);

  fs.writeFile(filepath, JSON.stringify(invoiceData, null, 2), err => {
    if (err) {
      console.error('❌ Error saving file:', err);
      return res.status(500).json({ message: 'Failed to save invoice' });
    }
    console.log('✅ Invoice saved:', filename);
    res.json({ message: 'Invoice saved successfully', filename });
  });
});

// Optional: Preview data route (if needed)
app.get('/preview/:filename', (req, res) => {
  const filepath = path.join(__dirname, 'invoices', req.params.filename);
  if (fs.existsSync(filepath)) {
    const data = fs.readFileSync(filepath, 'utf8');
    res.json(JSON.parse(data));
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

app.use('/PRINTABLE', express.static(path.join(__dirname, 'PRINTABLE')));
