'use strict';

// utils/mailer.js
// ✅ Outbox-based mailer (no direct nodemailer here)
// Worker handles actual SMTP sending + retries + logs

const { queueEmail } = require('../services/emailOutboxService');

/* =========================================================
   ONE-TIME DIAGNOSTICS (helps you see Railway Variables)
   - This DOES NOT verify SMTP connection (worker must do that)
========================================================= */
let _didLogEmailEnv = false;

function redact(v) {
  const s = String(v || '');
  if (!s) return '(missing)';
  if (s.length <= 6) return '***';
  return s.slice(0, 3) + '***' + s.slice(-2);
}

function logEmailEnvOnce() {
  if (_didLogEmailEnv) return;
  _didLogEmailEnv = true;

  const appBase = String(process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
  const admin = String(process.env.ADMIN_EMAIL || '').trim();

  // These env vars are for the WORKER (not used here),
  // but logging them helps you confirm Railway Variables are set.
  const smtpHost = String(process.env.EMAIL_HOST || process.env.SMTP_HOST || '').trim();
  const smtpPort = String(process.env.EMAIL_PORT || process.env.SMTP_PORT || '').trim();
  const smtpUser = String(process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.EMAIL_PASS || process.env.SMTP_PASS || '').trim();

  console.log('📧 Email Config Check (outbox mode)');
  console.log('   APP_BASE_URL/APP_URL:', appBase ? appBase : '(missing)');
  console.log('   ADMIN_EMAIL:', admin ? admin : '(missing)');
  console.log('   SMTP host:', smtpHost ? smtpHost : '(missing)');
  console.log('   SMTP port:', smtpPort ? smtpPort : '(missing)');
  console.log('   SMTP user:', smtpUser ? smtpUser : '(missing)');
  console.log('   SMTP pass:', smtpPass ? redact(smtpPass) : '(missing)');
  console.log('   Note: SMTP connection is verified in the WORKER, not here.');
}

/* =========================================================
   HELPERS
========================================================= */
function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAppBaseUrl() {
  const base = String(process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
  return base ? base.replace(/\/+$/, '') : '';
}

async function safeQueueEmail(payload, label) {
  // log env once when email feature is first used
  logEmailEnvOnce();

  try {
    const out = await queueEmail(payload);
    // optional: show queue id if your service returns it
    if (out && (out.id || out.insertId)) {
      console.log(`✅ Email queued (${label}):`, out.id || out.insertId);
    } else {
      console.log(`✅ Email queued (${label})`);
    }
    return out;
  } catch (err) {
    console.error(`❌ Email queue failed (${label}):`, err?.message || err);
    // Don’t throw so the main action (create user, etc.) still succeeds
    return null;
  }
}

/* =========================================================
   EMAILS
========================================================= */

/**
 * Send email to admin notifying a new user is created
 * NOTE: Keeping your current behavior (includes password), but this is NOT recommended.
 */
async function notifyAdminUserCreated({ username, role, password, createdBy, email }) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
  if (!adminEmail) {
    logEmailEnvOnce();
    console.warn('[MAILER] ADMIN_EMAIL is missing. Skipping admin notification.');
    return;
  }

  const subject = 'New User Created';

  const html = `
    <div style="font-family:Segoe UI,Tahoma,sans-serif; font-size:14px; color:#111; line-height:1.5">
      <h2 style="margin:0 0 8px 0;">New User Created</h2>
      <p style="margin:0 0 12px 0;">A new user has been created in the system.</p>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr><td><strong>Username:</strong></td><td>${esc(username)}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${esc(email || 'N/A')}</td></tr>
        <tr><td><strong>Password:</strong></td><td>${esc(password || 'N/A')}</td></tr>
        <tr><td><strong>Role:</strong></td><td>${esc(role)}</td></tr>
        <tr><td><strong>Created By:</strong></td><td>${esc(createdBy || 'Admin')}</td></tr>
        <tr><td><strong>Date:</strong></td><td>${esc(new Date().toLocaleString())}</td></tr>
      </table>
    </div>
  `;

  const text =
    `New User Created\n` +
    `Username: ${username}\n` +
    `Email: ${email || 'N/A'}\n` +
    `Password: ${password || 'N/A'}\n` +
    `Role: ${role}\n` +
    `Created By: ${createdBy || 'Admin'}\n` +
    `Date: ${new Date().toLocaleString()}\n`;

  await safeQueueEmail(
    {
      type: 'admin_user_created',
      referenceNo: username || null,
      to: adminEmail,
      subject,
      html,
      text,
      attachments: null,
      createdBy: null // system
    },
    'admin_user_created'
  );
}

/**
 * Invitation email (token link)
 */
async function sendInvitationEmail({ email, username, token }) {
  const to = String(email || '').trim();
  if (!to) {
    logEmailEnvOnce();
    console.warn('[MAILER] Invitation email missing recipient address (email).');
    return;
  }

  const appBaseUrl = getAppBaseUrl();
  if (!appBaseUrl) {
    logEmailEnvOnce();
    console.warn('[MAILER] APP_BASE_URL (or APP_URL) is missing. Skipping invitation email.');
    return;
  }

  const inviteLink = `${appBaseUrl}/set-password.html?token=${encodeURIComponent(token)}`;
  const subject = 'You are invited to the System';

  const html = `
    <div style="font-family:Segoe UI,Tahoma,sans-serif; font-size:14px; color:#111; line-height:1.5">
      <h2 style="margin:0 0 8px 0;">Welcome ${esc(username)}</h2>
      <p style="margin:0 0 12px 0;">You have been invited to access the system.</p>
      <p style="margin:0 0 12px 0;">Click the button below to set your password:</p>
      <p style="margin:16px 0;">
        <a href="${inviteLink}"
           style="display:inline-block; padding:10px 14px; background:#111; color:#fff; text-decoration:none; border-radius:8px;">
           Set Password
        </a>
      </p>
      <p style="margin:0; color:#555; font-size:12px;">
        If you did not request this, you can ignore this email.
      </p>
    </div>
  `;

  const text =
    `Welcome ${username}\n\n` +
    `You have been invited to access the system.\n` +
    `Set your password here:\n${inviteLink}\n`;

  await safeQueueEmail(
    {
      type: 'invite_set_password',
      referenceNo: username || null,
      to,
      subject,
      html,
      text,
      attachments: null,
      createdBy: null
    },
    'invite_set_password'
  );
}

module.exports = { notifyAdminUserCreated, sendInvitationEmail };
