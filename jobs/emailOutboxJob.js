'use strict';

const os = require('os');
const crypto = require('crypto');
const { getConn } = require('../helpers/db');
const { sendEmail, verifyTransporter } = require('../services/emailService');

function workerId() {
  const base = `${os.hostname()}-${process.pid}`;
  const rand = crypto.randomBytes(3).toString('hex');
  return `${base}-${rand}`.slice(0, 64);
}

function nextDelayMinutes(attempts) {
  // attempts is 1-based after increment
  // 1, 3, 10, 30, 60 (cap)
  const seq = [1, 3, 10, 30, 60];
  return seq[Math.min(Math.max(attempts - 1, 0), seq.length - 1)];
}

function jitterMs(maxMs = 800) {
  return Math.floor(Math.random() * maxMs);
}

function decodeAttachments(attachmentsJson) {
  if (!attachmentsJson) return [];
  let arr = [];
  try { arr = JSON.parse(attachmentsJson); } catch { return []; }

  return arr
    .filter(x => x && x.filename && x.dataBase64)
    .map(x => ({
      filename: x.filename,
      contentType: x.contentType || 'application/octet-stream',
      content: Buffer.from(x.dataBase64, 'base64')
    }));
}

/**
 * Try to bucket the error so logs show "AUTH" vs "DNS" vs "PORT" etc.
 * Also identifies permanent failures that shouldn't be retried.
 */
function classifyEmailError(err) {
  const code = String(err?.code || '').toUpperCase();
  const respCode = Number(err?.responseCode || err?.statusCode || 0) || 0;
  const msg = String(err?.message || err || '').toLowerCase();
  const response = String(err?.response || '').toLowerCase();

  const hay = `${msg} ${response}`.trim();

  // --- DNS / network name resolution ---
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || hay.includes('getaddrinfo')) {
    return { category: 'DNS', permanent: false };
  }

  // --- Connection / port blocked / timeout ---
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return { category: 'PORT/CONN', permanent: false };
  }

  // --- TLS / SSL ---
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

  // --- Auth failures (usually permanent until config fixed) ---
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

  // --- SMTP permanent failures (bad recipient, rejected, etc.) ---
  // Common: 550 mailbox unavailable, 553 invalid address, 554 rejected
  if (respCode >= 500 && respCode < 600) {
    // Some 5xx can be temporary, but for outbox it's safer to treat as permanent
    // if it looks like an address/content policy issue.
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

    // Default: still retry a few times in case provider was flaky
    return { category: `SMTP-${respCode}`, permanent: false };
  }

  // --- Default unknown ---
  return { category: code || 'UNKNOWN', permanent: false };
}

async function processOutboxOnce() {
  if (String(process.env.EMAIL_OUTBOX_ENABLED || 'true').toLowerCase() !== 'true') return;

  const conn = await getConn();
  const wid = workerId();

  let jobId = null;

  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `
      SELECT *
      FROM email_outbox
      WHERE status = 'queued'
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        AND (locked_at IS NULL OR locked_at < (NOW() - INTERVAL 5 MINUTE))
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
      `
    );

    if (!rows.length) {
      await conn.commit();
      return;
    }

    const job = rows[0];
    jobId = job.id;

    await conn.execute(
      `UPDATE email_outbox
       SET status='sending', locked_at=NOW(), locked_by=?
       WHERE id=?`,
      [wid, jobId]
    );

    await conn.commit();

    const attemptNo = Number(job.attempts || 0) + 1;
    console.log(`📧 [outbox] sending id=${jobId} to=${job.recipient} attempt=${attemptNo}`);

    const attachments = decodeAttachments(job.attachments_json);

    // Send outside transaction
    const info = await sendEmail({
      to: job.recipient,
      subject: job.subject,
      html: job.html || undefined,
      text: job.text || undefined,
      attachments
    });

    await conn.execute(
      `UPDATE email_outbox
       SET status='sent', sent_at=NOW(), last_error=NULL, locked_at=NULL, locked_by=NULL
       WHERE id=?`,
      [jobId]
    );

    await conn.execute(
      `INSERT INTO email_logs (outbox_id, type, reference_no, recipient, subject, status, attempts, error, message_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, NULL, ?, ?)`,
      [jobId, job.type, job.reference_no, job.recipient, job.subject, attemptNo, info?.messageId || null, job.created_by]
    );

    console.log(`✅ [outbox] sent id=${jobId} messageId=${info?.messageId || 'n/a'}`);
  } catch (err) {
    // If we error before commit, rollback safely
    try { await conn.rollback(); } catch {}

    const msg = String(err?.message || err || 'Unknown error');
    const { category, permanent } = classifyEmailError(err);

    try {
      if (!jobId) {
        console.error(`❌ [outbox] error before locking a job: ${category}: ${msg}`);
        return;
      }

      // Re-read attempts for this exact job
      const [[cur]] = await conn.execute(
        `SELECT id, attempts, recipient, subject, type, reference_no, created_by
         FROM email_outbox
         WHERE id=?`,
        [jobId]
      );

      if (!cur?.id) {
        console.error(`❌ [outbox] job disappeared id=${jobId}: ${category}: ${msg}`);
        return;
      }

      const attempts = Number(cur.attempts || 0) + 1;

      // Permanent failures: don't keep retrying (AUTH, obvious 5xx address rejects, etc.)
      const maxAttempts = 5;
      const dead = permanent || attempts >= maxAttempts;

      const delayMin = nextDelayMinutes(attempts);
      const status = dead ? 'dead' : 'queued';

      await conn.execute(
        `UPDATE email_outbox
         SET status=?, attempts=?, last_error=?, 
             next_attempt_at = ${dead ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)'},
             locked_at=NULL, locked_by=NULL
         WHERE id=?`,
        dead
          ? [status, attempts, msg.slice(0, 2000), jobId]
          : [status, attempts, msg.slice(0, 2000), delayMin, jobId]
      );

      await conn.execute(
        `INSERT INTO email_logs (outbox_id, type, reference_no, recipient, subject, status, attempts, error, message_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, NULL, ?)`,
        [jobId, cur.type, cur.reference_no, cur.recipient, cur.subject, attempts, `[${category}] ${msg}`.slice(0, 2000), cur.created_by]
      );

      if (dead) {
        console.error(`🛑 [outbox] DEAD id=${jobId} attempts=${attempts} category=${category} err=${msg}`);
      } else {
        console.error(`↩️  [outbox] retry scheduled id=${jobId} attempts=${attempts} in=${delayMin}m category=${category} err=${msg}`);
      }
    } catch (e2) {
      console.error('❌ email worker fail-log error:', e2);
    }
  } finally {
    conn.release();
  }
}

async function verifyTransportOnStartup() {
  // If you haven't patched emailService yet, this will just log and continue.
  if (typeof verifyTransporter !== 'function') {
    console.warn('⚠️  [outbox] verifyTransporter() not found in emailService — skipping transporter.verify()');
    return;
  }

  try {
    await verifyTransporter();
    console.log('✅ [outbox] transporter.verify() OK');
  } catch (e) {
    const msg = String(e?.message || e || 'Unknown verify error');
    const { category } = classifyEmailError(e);
    console.error(`❌ [outbox] transporter.verify() FAILED (${category}): ${msg}`);
    // Keep worker running; outbox retries will capture send failures too.
  }
}

function startEmailOutboxJob() {
  // verify once on startup
  verifyTransportOnStartup().catch(() => {});

  // Every 10 seconds (safe + responsive)
  setInterval(() => {
    // small jitter avoids thundering herd if you have multiple instances
    setTimeout(() => {
      processOutboxOnce().catch(e => console.error('❌ outbox tick error:', e));
    }, jitterMs());
  }, 10_000);

  console.log('✅ Email outbox worker started (every 10s)');
}

module.exports = { startEmailOutboxJob, processOutboxOnce };
