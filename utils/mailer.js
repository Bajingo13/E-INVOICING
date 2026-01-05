const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // change if not Gmail
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function notifyAdminUserCreated({ username, role, createdBy }) {
  await transporter.sendMail({
    from: `"User Management System" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: 'New User Created',
    html: `
      <div style="font-family:Segoe UI,Tahoma,sans-serif">
        <h2 style="color:#4e54c8;">New User Created</h2>
        <p>A new user has been created in the system.</p>
        <table cellpadding="6">
          <tr><td><strong>Username:</strong></td><td>${username}</td></tr>
          <tr><td><strong>Role:</strong></td><td>${role}</td></tr>
          <tr><td><strong>Created By:</strong></td><td>${createdBy || 'Admin'}</td></tr>
          <tr><td><strong>Date:</strong></td><td>${new Date().toLocaleString()}</td></tr>
        </table>
      </div>
    `
  });
}

module.exports = { notifyAdminUserCreated };
