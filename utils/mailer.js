// utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,        // SSL port for Gmail
  secure: true,     // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


/**
 * Send email to admin notifying a new user is created
 * @param {Object} param0
 * @param {string} param0.username - new user's username
 * @param {string} param0.role - new user's role
 * @param {string} param0.password - optional password (temporary)
 * @param {string} param0.createdBy - who created this user
 */


async function notifyAdminUserCreated({ username, role, password, createdBy }) {
  try {
    await transporter.sendMail({
      from: `"User Management System" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL, // admin email
      subject: 'New User Created',
      html: `
        <div style="font-family:Segoe UI,Tahoma,sans-serif">
          <h2 style="color:#4e54c8;">New User Created</h2>
          <p>A new user has been created in the system.</p>
          <table cellpadding="6">
            <tr><td><strong>Username:</strong></td><td>${username}</td></tr>
            <tr><td><strong>Password:</strong></td><td>${password || 'N/A'}</td></tr>
            <tr><td><strong>Role:</strong></td><td>${role}</td></tr>
            <tr><td><strong>Created By:</strong></td><td>${createdBy || 'Admin'}</td></tr>
            <tr><td><strong>Date:</strong></td><td>${new Date().toLocaleString()}</td></tr>
          </table>
        </div>
      `
    });
  } catch (err) {
    console.error('[MAIL ERROR]', err);
    // Don't throw, so user creation still succeeds
  }
}

module.exports = { notifyAdminUserCreated };
