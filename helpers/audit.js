'use strict';

const crypto = require('crypto');

function ensureRequestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = incoming && String(incoming).trim()
    ? String(incoming).trim().slice(0, 36)
    : crypto.randomUUID();

  req.request_id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function getReqIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || null;
}

// Keep JSON from exploding your DB
function safeJson(value, maxLen = 20000) {
  if (value == null) return null;

  try {
    const s = JSON.stringify(value);

    if (s.length <= maxLen) return s; // valid JSON

    // still valid JSON:
    return JSON.stringify({
      truncated: true,
      original_length: s.length,
      preview: s.slice(0, maxLen)
    });
  } catch {
    return JSON.stringify({ error: 'json_stringify_failed' });
  }
}

/**
 * logAudit(pool, req, payload)
 * payload = { action, entity_type, entity_id, summary, success, before, after, meta }
 *
 * IMPORTANT: This function is fail-safe (never throws)
 */
async function logAudit(pool, req, payload) {
  try {
    if (!payload || !payload.action) return;

    const actor = req.user || req.session?.user || null;

    const actor_user_id = actor?.id ?? null;
    const actor_username = actor?.username ?? null;
    const actor_role = actor?.role ?? null;

    const ip_address = getReqIp(req);
    const user_agent = req.headers['user-agent']
      ? String(req.headers['user-agent']).slice(0, 255)
      : null;

    const request_id = req.request_id || null;

    const {
      action,
      entity_type = null,
      entity_id = null,
      summary = null,
      success = 1,
      before = null,
      after = null,
      meta = null
    } = payload;

    await pool.query(
      `
      INSERT INTO audit_logs
        (actor_user_id, actor_username, actor_role,
         action, entity_type, entity_id,
         success, summary,
         ip_address, user_agent, request_id,
         before_json, after_json, meta_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        actor_user_id,
        actor_username,
        actor_role,
        String(action).slice(0, 64),
        entity_type ? String(entity_type).slice(0, 64) : null,
        entity_id != null ? String(entity_id).slice(0, 64) : null,
        success ? 1 : 0,
        summary ? String(summary).slice(0, 255) : null,
        ip_address,
        user_agent,
        request_id ? String(request_id).slice(0, 64) : null,
        safeJson(before, 20000),
        safeJson(after, 20000),
        safeJson(meta, 20000)
      ]
    );
  } catch (err) {
    // fail-safe: never break main request
    console.error('[AUDIT] insert failed:', err?.code || err?.message || err);
  }
}

module.exports = { ensureRequestId, logAudit };
