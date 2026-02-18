'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { pool } = require('../helpers/db');
const asyncHandler = require('../middleware/asynchandler');

const { requireLogin } = require('../middleware/roles');
const { requirePermission } = require('../middleware/permissions');
const { PERMISSIONS } = require('../config/permissions');

const { logAudit } = require('../helpers/audit');

// ✅ OUTBOX QUEUE (DB-based)
const { queueEmail } = require('../services/emailOutboxService');

// (kept) your existing util – not changed here
const { notifyAdminUserCreated } = require('../utils/mailer');

const VALID_ROLES = ['super', 'approver', 'submitter'];

/* =========================================================
   HELPERS
========================================================= */

function actorName(req) {
  return req?.session?.user?.username || req?.user?.username || 'unknown';
}

async function getUserById(id) {
  const [[u]] = await pool.query(
    'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
    [id]
  );
  return u || null;
}

async function countSupers() {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS total FROM users WHERE role = "super"'
  );
  return Number(row?.total || 0);
}

function getAppBaseUrl() {
  const base = String(process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
  return base ? base.replace(/\/+$/, '') : '';
}

/* =========================
   GET /api/users
   (NO AUDIT - non-transaction)
========================= */
router.get(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT id, username, email, role, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(rows);
  })
);

/* =========================
   POST /api/users
   Create user
========================= */
router.post(
  '/',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { username, password, role, email } = req.body;

    if (!username || !password || !email || !role) {
      try {
        await logAudit(pool, req, {
          action: 'user.create',
          entity_type: 'user',
          entity_id: username || null,
          summary: `Create user blocked: missing fields`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      try {
        await logAudit(pool, req, {
          action: 'user.create',
          entity_type: 'user',
          entity_id: username,
          summary: `Create user blocked: invalid role (${role})`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [exists] = await pool.query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (exists.length) {
      try {
        await logAudit(pool, req, {
          action: 'user.create',
          entity_type: 'user',
          entity_id: username,
          summary: `Create user blocked: username/email already exists`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [result] = await pool.query(
      `INSERT INTO users (username, password, email, role, password_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashedPassword, email, role, passwordExpiresAt]
    );

    const newUserId = result.insertId;

    try {
      await logAudit(pool, req, {
        action: 'user.create',
        entity_type: 'user',
        entity_id: newUserId,
        summary: `Created user ${username} (${role})`,
        success: 1,
        after: { id: newUserId, username, email, role }
      });
    } catch {}

    // (kept) your existing behavior - no change here
    // If you later want: stop emailing plain passwords and switch to invite links,
    // tell me and I’ll convert this flow to token-based activation.
    try {
      await notifyAdminUserCreated({
        username,
        role,
        email,
        password, 
        createdBy: actorName(req)
      });
    } catch (e) {
      console.error('notifyAdminUserCreated failed:', e);
    }

    res.json({ message: 'User created successfully' });
  })
);

/* =========================
   POST /api/users/invite
   ✅ Now queues email to outbox (no direct nodemailer)
========================= */
router.post(
  '/invite',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { username, email, role } = req.body;

    if (!username || !email || !role) {
      try {
        await logAudit(pool, req, {
          action: 'user.invite',
          entity_type: 'user',
          entity_id: username || email || null,
          summary: `Invite blocked: missing fields`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!VALID_ROLES.includes(role)) {
      try {
        await logAudit(pool, req, {
          action: 'user.invite',
          entity_type: 'user',
          entity_id: username,
          summary: `Invite blocked: invalid role (${role})`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (exists.length) {
      try {
        await logAudit(pool, req, {
          action: 'user.invite',
          entity_type: 'user',
          entity_id: username,
          summary: `Invite blocked: username/email already exists`,
          success: 0,
          meta: { username, email, role }
        });
      } catch {}
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const appBaseUrl = getAppBaseUrl();
    if (!appBaseUrl) {
      return res.status(500).json({ error: 'Missing APP_BASE_URL (or APP_URL) env var' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO invitations (email, username, role, token, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [email, username, role, token, expiresAt]
    );

    try {
      await logAudit(pool, req, {
        action: 'user.invite',
        entity_type: 'user',
        entity_id: username,
        summary: `Queued invitation to ${email} for ${username} (${role})`,
        success: 1,
        meta: { username, email, role, expires_at: expiresAt }
      });
    } catch {}

    const inviteLink = `${appBaseUrl}/invite.html?token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family:Arial,sans-serif; font-size:14px; color:#111; line-height:1.5">
        <h2 style="margin:0 0 8px 0;">You have been invited</h2>
        <p style="margin:0 0 12px 0;">
          An account invitation has been created for you.
        </p>
        <p style="margin:0 0 12px 0;">
          Click the button below to activate your account:
        </p>
        <p style="margin:16px 0;">
          <a href="${inviteLink}"
             style="display:inline-block; padding:10px 14px; background:#111; color:#fff; text-decoration:none; border-radius:8px;">
             Accept Invitation
          </a>
        </p>
        <p style="margin:0; color:#555; font-size:12px;">
          This link expires in 24 hours. If you did not expect this invite, ignore this email.
        </p>
      </div>
    `;

    const text =
      `You have been invited.\n\n` +
      `Open this link to activate your account:\n${inviteLink}\n\n` +
      `This link expires in 24 hours.`;

    // ✅ Queue email (worker will send + retry)
    await queueEmail({
      type: 'invite',
      referenceNo: username,
      to: email,
      subject: 'Invitation to join',
      html,
      text,
      attachments: null,
      createdBy: req.session.user?.id || null
    });

    res.json({ message: 'Invitation queued (will send shortly).' });
  })
);

router.post(
  '/invitations/accept',
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const [[inv]] = await pool.query(
      `SELECT * FROM invitations
       WHERE token = ? AND expires_at > NOW() AND used_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (!inv) return res.status(400).json({ error: 'Invalid or expired invitation' });

    // Create a temporary password OR require user to set password.
    // For now: generate temp password and force change on first login.
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const passwordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Prevent duplicates
    const [exists] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [inv.email, inv.username]
    );
    if (exists.length) return res.status(400).json({ error: 'User already exists' });

    const [result] = await pool.query(
      `INSERT INTO users (username, password, email, role, password_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [inv.username, hashedPassword, inv.email, inv.role, passwordExpiresAt]
    );

    await pool.query(
      `UPDATE invitations SET used_at = NOW(), used_user_id = ? WHERE id = ?`,
      [result.insertId, inv.id]
    );

    // Optional: email temp password (or better: redirect to set-password page)
    await queueEmail({
      type: 'invite-accepted',
      referenceNo: inv.username,
      to: inv.email,
      subject: 'Your account is ready',
      html: `<p>Your account has been created.</p><p>Temporary password: <b>${tempPassword}</b></p><p>Please change it after login.</p>`,
      text: `Your account has been created.\nTemporary password: ${tempPassword}\nPlease change it after login.`,
      createdBy: null
    });

    return res.json({ message: 'Invitation accepted' });
  })
);


/* =========================
   PUT /api/users/:id
   Update role / password
========================= */
router.put(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, password } = req.body;

    if (!role && !password) {
      try {
        await logAudit(pool, req, {
          action: 'user.update',
          entity_type: 'user',
          entity_id: id,
          summary: `Update blocked: nothing to update`,
          success: 0
        });
      } catch {}
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const target = await getUserById(id);
    if (!target) {
      try {
        await logAudit(pool, req, {
          action: 'user.update',
          entity_type: 'user',
          entity_id: id,
          summary: `Update blocked: user not found`,
          success: 0
        });
      } catch {}
      return res.status(404).json({ error: 'User not found' });
    }

    // 🚫 prevent self-downgrade
    if (role && req.session.user.id === Number(id) && role !== 'super') {
      try {
        await logAudit(pool, req, {
          action: 'user.update',
          entity_type: 'user',
          entity_id: id,
          summary: `Update blocked: attempted self-downgrade (${target.role} → ${role})`,
          success: 0,
          before: { role: target.role },
          after: { role }
        });
      } catch {}
      return res.status(400).json({ error: 'You cannot downgrade your own account' });
    }

    if (role && !VALID_ROLES.includes(role)) {
      try {
        await logAudit(pool, req, {
          action: 'user.update',
          entity_type: 'user',
          entity_id: id,
          summary: `Update blocked: invalid role (${role})`,
          success: 0,
          meta: { role }
        });
      } catch {}
      return res.status(400).json({ error: 'Invalid role' });
    }

    // 🚫 prevent downgrading last super
    if (role && target.role === 'super' && role !== 'super') {
      const totalSupers = await countSupers();
      if (totalSupers <= 1) {
        try {
          await logAudit(pool, req, {
            action: 'user.update',
            entity_type: 'user',
            entity_id: id,
            summary: `Update blocked: cannot downgrade last Super user`,
            success: 0,
            before: { role: target.role },
            after: { role }
          });
        } catch {}
        return res.status(400).json({ error: 'At least one Super user must exist' });
      }
    }

    const updates = [];
    const values = [];
    const changed_fields = [];

    let passwordChanged = false;

    if (role) {
      updates.push('role = ?');
      values.push(role);
      changed_fields.push('role');
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashed);

      updates.push('password_expires_at = ?');
      const newExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      values.push(newExp);

      passwordChanged = true;
      changed_fields.push('password');
    }

    values.push(id);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    try {
      await logAudit(pool, req, {
        action: 'user.update',
        entity_type: 'user',
        entity_id: id,
        summary: `Updated user ${target.username}${role ? ` (role: ${target.role} → ${role})` : ''}${passwordChanged ? ' (password changed)' : ''}`,
        success: 1,
        before: { role: target.role },
        after: { role: role || target.role, password_changed: passwordChanged },
        meta: { changed_fields }
      });
    } catch {}

    res.json({ message: 'User updated successfully' });
  })
);

/* =========================
   DELETE /api/users/:id
========================= */
router.delete(
  '/:id',
  requireLogin,
  requirePermission(PERMISSIONS.USER_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (req.session.user.id === Number(id)) {
      try {
        await logAudit(pool, req, {
          action: 'user.delete',
          entity_type: 'user',
          entity_id: id,
          summary: `Delete blocked: attempted self-delete`,
          success: 0
        });
      } catch {}
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await getUserById(id);
    if (!target) {
      try {
        await logAudit(pool, req, {
          action: 'user.delete',
          entity_type: 'user',
          entity_id: id,
          summary: `Delete blocked: user not found`,
          success: 0
        });
      } catch {}
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'super') {
      const totalSupers = await countSupers();
      if (totalSupers <= 1) {
        try {
          await logAudit(pool, req, {
            action: 'user.delete',
            entity_type: 'user',
            entity_id: id,
            summary: `Delete blocked: cannot delete last Super user`,
            success: 0,
            before: { username: target.username, role: target.role }
          });
        } catch {}
        return res.status(400).json({ error: 'Cannot delete the last Super user' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    try {
      await logAudit(pool, req, {
        action: 'user.delete',
        entity_type: 'user',
        entity_id: id,
        summary: `Deleted user ${target.username} (${target.role})`,
        success: 1,
        before: { username: target.username, email: target.email, role: target.role }
      });
    } catch {}

    res.json({ message: 'User deleted successfully' });
  })
);

module.exports = router;
