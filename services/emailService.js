'use strict';

const nodemailer = require('nodemailer');

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const fromName = process.env.EMAIL_FROM_NAME || 'No Reply';
  const fromEmail = process.env.EMAIL_FROM_EMAIL || user;

  if (!host || !port || !user || !pass) {
    return { ok: false, error: 'Missing SMTP env vars (SMTP_HOST/PORT/USER/PASS)' };
  }

  return {
    ok: true,
    transport: {
      host,
      port,
      secure,
      auth: { user, pass },

      // sensible defaults; you can override with env vars if needed
      // (these help with flaky networks/providers)
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONN || 2),
      maxMessages: Number(process.env.SMTP_MAX_MSG || 50),
      connectionTimeout: Number(process.env.SMTP_CONN_TIMEOUT_MS || 20_000),
      greetingTimeout: Number(process.env.SMTP_GREET_TIMEOUT_MS || 15_000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30_000)
    },
    from: `"${fromName}" <${fromEmail}>`
  };
}

function classifyEmailError(err) {
  const code = String(err?.code || '').toUpperCase();
  const respCode = Number(err?.responseCode || err?.statusCode || 0) || 0;
  const msg = String(err?.message || err || '').toLowerCase();
  const response = String(err?.response || '').toLowerCase();
  const hay = `${msg} ${response}`.trim();

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || hay.includes('getaddrinfo')) {
    return { category: 'DNS', permanent: false };
  }

  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return { category: 'PORT/CONN', permanent: false };
  }

  if (
    code === 'ESOCKET' ||
    hay.includes('self signed') ||
    hay.includes('certificate') ||
    hay.includes('tls') ||
    hay.includes('ssl') ||
    hay.includes('wrong version number') ||
    hay.includes('handshake')
  ) {
    return { category: 'TLS/SSL', permanent: false };
  }

  if (
    code === 'EAUTH' ||
    hay.includes('invalid login') ||
    hay.includes('authentication failed') ||
    hay.includes('username and password not accepted') ||
    hay.includes('535') ||
    hay.includes('auth')
  ) {
    return { category: 'AUTH', permanent: true };
  }

  if (respCode >= 500 && respCode < 600) {
    if (
      hay.includes('mailbox') ||
      hay.includes('user unknown') ||
      hay.includes('no such user') ||
      hay.includes('invalid recipient') ||
      hay.includes('recipient address rejected') ||
      hay.includes('address rejected') ||
      hay.includes('spam') ||
      hay.includes('policy') ||
      hay.includes('rejected')
    ) {
      return { category: `SMTP-${respCode}`, permanent: true };
    }
    return { category: `SMTP-${respCode}`, permanent: false };
  }

  return { category: code || 'UNKNOWN', permanent: false };
}

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const cfg = getEmailConfig();
  if (!cfg.ok) throw new Error(cfg.error);

  _transporter = nodemailer.createTransport(cfg.transport);
  _transporter.__from = cfg.from;
  _transporter.__meta = {
    host: cfg.transport.host,
    port: cfg.transport.port,
    secure: cfg.transport.secure,
    user: cfg.transport.auth?.user
  };

  return _transporter;
}

/**
 * ✅ verifyTransporter()
 * Runs an SMTP NOOP/login check. Useful on worker startup.
 */
async function verifyTransporter() {
  const transporter = getTransporter();

  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const { category } = classifyEmailError(err);
    const meta = transporter.__meta || {};
    const hint =
      category === 'AUTH'
        ? 'Check SMTP_USER/SMTP_PASS (and provider app-password / SMTP auth settings).'
        : category === 'DNS'
        ? 'Check SMTP_HOST spelling and DNS/network access from the server.'
        : category === 'PORT/CONN'
        ? 'Check SMTP_PORT, firewall/VPC rules, and whether the provider blocks outbound SMTP.'
        : category === 'TLS/SSL'
        ? 'Check SMTP_SECURE setting vs port (465 usually secure=true; 587 usually secure=false + STARTTLS).'
        : 'Check SMTP settings and server connectivity.';

    const msg = String(err?.message || err || 'Unknown verify error');
    const e = new Error(
      `SMTP verify failed [${category}] host=${meta.host} port=${meta.port} secure=${meta.secure} user=${meta.user} :: ${msg} :: ${hint}`
    );
    e.original = err;
    e.category = category;
    throw e;
  }
}

/**
 * attachments: [{ filename, contentType, content(Buffer) }]
 */
async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const transporter = getTransporter();
  const from = transporter.__from;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
      attachments
    });

    return {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || []
    };
  } catch (err) {
    const { category } = classifyEmailError(err);
    const meta = transporter.__meta || {};
    const msg = String(err?.message || err || 'Unknown send error');

    const e = new Error(
      `SMTP send failed [${category}] to=${to} host=${meta.host} port=${meta.port} secure=${meta.secure} :: ${msg}`
    );
    e.original = err;
    e.category = category;
    throw e;
  }
}

module.exports = { sendEmail, verifyTransporter };
