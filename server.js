'use strict';

/* =========================
   Load environment FIRST
========================= */
require('dotenv').config();

/* =========================
   Safe env logging
========================= */
console.log(
  'DATABASE_URL:',
  process.env.DATABASE_URL
    ? process.env.DATABASE_URL.slice(0, 20) + '...'
    : 'undefined (LOCAL)'
);

console.log('PORT env:', process.env.PORT);

/* =========================
   Imports
========================= */
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

/* =========================
   Route modules
========================= */
const invoicesRoutes = require('./routes/invoices');
const companyRoutes = require('./routes/company');
const filesRoutes = require('./routes/files');
const authRoutes = require('./routes/auth');
const coaRoutes = require('./routes/coa');
const importRoutes = require('./routes/import');
const ewtRoutes = require('./routes/ewtRoutes');
const dashboardRoutes = require('./routes/dashboard');
const contactsRoutes = require('./routes/contacts');
const usersRoutes = require('./routes/users');
const loginHistoryRoutes = require('./routes/loginHistory');
const invoiceSettingsRoutes = require('./routes/invoiceSettings');
const reportsRouter = require('./routes/reports');

/* =========================
   App setup
========================= */
const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   Middleware
========================= */
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan('dev'));

/* =========================
   Session
========================= */
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

/* =========================
   Routes
========================= */
app.use('/api', invoicesRoutes);
app.use('/api/company-info', companyRoutes);
app.use('/', filesRoutes);
app.use('/auth', authRoutes);
app.use('/api/coa', coaRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ewt', ewtRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/login-history', loginHistoryRoutes);
app.use('/api/invoice-settings', invoiceSettingsRoutes);
app.use('/api/reports', reportsRouter);

/* =========================
   Static pages
========================= */
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'Login.html'))
);

app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'Dashboard.html'))
);

app.get('/invoice', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'invoice.html'))
);

app.get('/company-setup', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'company_info.html'))
);

app.get('/invoice-list', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'invoice-list.html'))
);

/* =========================
   App version endpoint
========================= */
const pkg = require('./package.json');

app.get('/api/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

/* =========================
   Global error handler
========================= */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

/* =========================
   Start server
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
