const nodemailer = require('nodemailer');

function getMailerConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.MAIL_FROM || '').trim();
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';

  const configured = !!(host && port && user && pass && from);
  return { configured, host, port, user, pass, from, secure };
}

async function sendPasswordResetEmail({ to, resetLink, expiresMinutes }) {
  const cfg = getMailerConfig();
  if (!cfg.configured) {
    // eslint-disable-next-line no-console
    console.warn('[mail] SMTP not configured; skip sending reset email.');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const subject = 'Reset your ReelBoost AI password';
  const text = `We received a request to reset your ReelBoost AI password.

Use this link to reset your password:
${resetLink}

This link expires in ${expiresMinutes} minutes.

If you did not request this, you can safely ignore this email.`;

  const html = `
<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
  <h2>Reset your ReelBoost AI password</h2>
  <p>We received a request to reset your password.</p>
  <p>
    <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#0b84ff;color:#fff;text-decoration:none;border-radius:6px;">
      Reset password
    </a>
  </p>
  <p>If the button does not work, copy and paste this URL:</p>
  <p><a href="${resetLink}">${resetLink}</a></p>
  <p>This link expires in <b>${expiresMinutes} minutes</b>.</p>
  <p>If you did not request this, you can safely ignore this email.</p>
</div>`;

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

module.exports = { sendPasswordResetEmail };

