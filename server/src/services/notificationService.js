const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');

// Notifications are scoped by user_id (never by application scope). The bell shows IN_APP rows only.
const mine = (user) => ({ userId: user.id, channel: 'IN_APP' });

const shape = (n) => ({
  id: n.id,
  subject: n.subject,
  body: n.body,
  sentOn: n.sentOn,
  readOn: n.readOn,
  obligationId: n.obligationId,
  applicationId: n.obligation ? n.obligation.applicationId : null,
  appCode: n.obligation ? n.obligation.application.appCode : null,
});

async function listNotifications(user, { page, pageSize, unread }) {
  const where = { ...mine(user), ...(unread ? { readOn: null } : {}) };
  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' }, // newest first
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { obligation: { select: { applicationId: true, application: { select: { appCode: true } } } } },
    }),
  ]);
  return { data: rows.map(shape), total };
}

function unreadCount(user) {
  return prisma.notification.count({ where: { ...mine(user), readOn: null } });
}

// Own rows only: someone else's id is a 404. Safe to repeat (read_on keeps its first value).
async function markRead(user, id) {
  const row = await prisma.notification.findFirst({ where: { id, ...mine(user) } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Notification not found');
  if (!row.readOn) {
    await prisma.notification.updateMany({ where: { id, readOn: null }, data: { readOn: new Date() } });
  }
  const fresh = await prisma.notification.findUnique({ where: { id } });
  return { id: fresh.id, readOn: fresh.readOn };
}

async function markAllRead(user) {
  const r = await prisma.notification.updateMany({
    where: { ...mine(user), readOn: null },
    data: { readOn: new Date() },
  });
  return { updated: r.count };
}

module.exports = { listNotifications, unreadCount, markRead, markAllRead };