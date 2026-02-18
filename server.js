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

/* ✅ Recurring job scheduler */
const { startRecurringJob } = require('./jobs/recurringJob');

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
const auditLogsRoute = require('./routes/auditLogs');
const { ensureRequestId } = require('./helpers/audit');
const invoicePreviewPdfPuppeteerRoutes = require('./routes/invoicePreviewPdfPuppeteer.routes');
const { startEmailOutboxJob } = require('./jobs/emailOutboxJob');


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
app.use(ensureRequestId);
app.use('/partials', express.static(path.join(__dirname, 'partials')));
app.use('/api/email', require('./routes/emailDebug'));


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
app.use('/api/invoices/import', require('./routes/invoiceImport'));
app.use('/api/audit-logs', auditLogsRoute);
app.use('/api/invoices', invoicePreviewPdfPuppeteerRoutes);

/* ✅ Recurring invoices runner endpoint */
app.use('/api/recurring-invoices', require('./routes/recurringInvoices'));

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

app.get('/activate', (req, res) => {
  const token = req.query.token ? `?token=${encodeURIComponent(req.query.token)}` : '';
  res.redirect(`/invite.html${token}`);
});
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
   ✅ Start recurring scheduler BEFORE listen
========================= */
startRecurringJob();
startEmailOutboxJob();

/* =========================
   Start server
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
