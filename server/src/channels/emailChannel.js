const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) throw new Error('SMTP_HOST is not set (use MAIL_MODE=preview to skip SMTP)');
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transport;
}

// Tests inject a fake transport (pass null to reset)
function setTransport(t) {
  transport = t;
}

// MAIL_MODE=preview: nothing leaves the server. The row is shown on the email preview screen.
async function send(user, message) {
  if (!user.email) throw new Error(`User ${user.id} has no email address`);
  if (process.env.MAIL_MODE === 'preview') return { mode: 'preview' };
  await getTransport().sendMail({
    from: process.env.MAIL_FROM || 'no-reply@sih26262.local',
    to: user.email,
    subject: message.subject,
    text: message.body,
  });
  return { mode: 'smtp' };
}

module.exports = { name: 'EMAIL', send, setTransport };