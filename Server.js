// server.js - Entry point (clean, small)
require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
 
const invoicesRoutes = require('./routes/invoices');
const companyRoutes = require('./routes/company');
const filesRoutes = require('./routes/files');
const authRoutes = require('./routes/auth');
const coaRoutes = require('./routes/COA');
const importRoutes = require('./routes/import');
const ewtRoutes = require('./routes/ewtRoutes');
// other routes you already have (auth, coa, import) can still be required here

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/ewt', ewtRoutes);

// Session (simple)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  },
  rolling: true
}));

// Mount route modules
app.use('/api', invoicesRoutes);
app.use('/api/company-info', companyRoutes);
app.use('/', filesRoutes);
app.use('/auth', authRoutes);
app.use('/api/coa', coaRoutes);
app.use('/api/import', importRoutes);


// Example of keeping legacy static routes (optional)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Dashboard.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice.html')));
app.get('/company-setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'company_info.html')));
app.get('/invoice-list', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice-list.html')));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Start
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
