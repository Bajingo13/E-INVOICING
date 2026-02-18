'use strict';

const { getConn } = require('../helpers/db');

async function queueEmail({
  type,
  referenceNo,
  to,
  subject,
  html,
  text,
  attachments, // [{ filename, contentType, dataBase64 }]
  createdBy
}) {
  const conn = await getConn();
  try {
    await conn.execute(
      `INSERT INTO email_outbox
        (type, reference_no, recipient, subject, html, text, attachments_json, created_by, status)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
      [
        type,
        referenceNo || null,
        to,
        subject,
        html || null,
        text || null,
        attachments ? JSON.stringify(attachments) : null,
        createdBy || null
      ]
    );
  } finally {
    conn.release();
  }
}

module.exports = { queueEmail };
