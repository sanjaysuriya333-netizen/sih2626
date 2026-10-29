const prisma = require('../utils/prisma');

// EMAIL notification rows with the rendered subject and body (head office fallback screen).
// In MAIL_MODE=preview nothing is sent by SMTP, so this list is the "inbox".
async function listEmails({ page, pageSize }) {
  const where = { channel: 'EMAIL' };
  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true } },
        obligation: { select: { applicationId: true, application: { select: { appCode: true } } } },
      },
    }),
  ]);
  const data = rows.map((n) => ({
    id: n.id,
    to: { name: n.user.name, email: n.user.email },
    subject: n.subject,
    body: n.body,
    sentOn: n.sentOn,
    obligationId: n.obligationId,
    applicationId: n.obligation ? n.obligation.applicationId : null,
    appCode: n.obligation ? n.obligation.application.appCode : null,
  }));
  return { data, total, mode: process.env.MAIL_MODE === 'preview' ? 'preview' : 'smtp' };
}

module.exports = { listEmails };