// server.js / app.js (your main file) — ensure uploads is served
'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const { startRecurringJob } = require('./jobs/recurringJob');
const { startEmailOutboxJob } = require('./jobs/emailOutboxJob');

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

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

// ✅ serve public
app.use(express.static(path.join(__dirname, 'public')));

// ✅ serve uploads (logos/signatures)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan('dev'));
app.use(ensureRequestId);

app.use('/partials', express.static(path.join(__dirname, 'partials')));
app.use('/api/email', require('./routes/emailDebug'));

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

app.use('/api/recurring-invoices', require('./routes/recurringInvoices'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Dashboard.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice.html')));
app.get('/company-setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'company_info.html')));
app.get('/invoice-list', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice-list.html')));

app.get('/activate', (req, res) => {
  const token = req.query.token ? `?token=${encodeURIComponent(req.query.token)}` : '';
  res.redirect(`/invite.html${token}`);
});

const pkg = require('./package.json');
app.get('/api/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

startRecurringJob();
startEmailOutboxJob();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});