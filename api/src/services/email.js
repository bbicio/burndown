const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `PDash <${process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL || 'http://localhost';

async function sendInvite({ to, firstName, token }) {
  const link = `${APP_URL}/activate.html?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'You have been invited to PDash',
    html: `
      <p>Hi ${firstName},</p>
      <p>You have been invited to access <strong>PDash</strong>.</p>
      <p>Click the link below to set your password and activate your account:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 48 hours.</p>
    `,
  });
}

async function sendPasswordReset({ to, firstName, token }) {
  const link = `${APP_URL}/reset-password.html?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'PDash — Password reset request',
    html: `
      <p>Hi ${firstName},</p>
      <p>We received a request to reset your PDash password.</p>
      <p>Click the link below to set a new password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 2 hours. If you did not request a reset, ignore this email.</p>
    `,
  });
}

async function sendShareNotification({ to, firstName, resourceType, resourceName, sharedBy, link }) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `PDash — ${sharedBy} shared a ${resourceType} with you`,
    html: `
      <p>Hi ${firstName},</p>
      <p><strong>${sharedBy}</strong> has shared the ${resourceType} <strong>"${resourceName}"</strong> with you on PDash.</p>
      <p><a href="${link}">Open in PDash</a></p>
    `,
  });
}

async function sendExportEmail({ to, firstName, exports }) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'PDash — Your export is ready',
    html: `<p>Hi ${firstName || 'there'},</p><p>Your PDash data export is attached.</p><p>Files: <strong>${exports.map(e => e.filename).join(', ')}</strong></p>`,
    attachments: exports.map(e => ({ filename: e.filename, content: e.content, contentType: e.type || 'text/csv' })),
  });
}

module.exports = { sendInvite, sendPasswordReset, sendShareNotification, sendExportEmail };
