// Called through the module object by other services, so tests can spy on these functions
const channels = require('../channels');

// One IN_APP notification per active user of the institution (called inside transactions)
async function notifyInstitutionUsers(db, institutionId, { subject, body, obligationId = null }) {
  const users = await db.user.findMany({
    where: { role: 'INSTITUTION', institutionId, active: true },
    select: { id: true },
  });
  if (users.length > 0) {
    const now = new Date();
    await db.notification.createMany({
      data: users.map((u) => ({ userId: u.id, channel: 'IN_APP', subject, body, sentOn: now, obligationId })),
    });
  }
  return users.length;
}

// The ONE function the daily job uses to record an alert (runs INSIDE the job's transaction).
// deliveries = [{ userId, channel }].
//  - IN_APP: written through the channel interface, sent_on = now.
//  - EMAIL / SMS: written with sent_on = null. They are sent by dispatchPending AFTER commit,
//    so a rollback never sends a message for a change that did not happen.
// Returns the number of notification rows written.
async function sendAlert(db, { deliveries, subject, body, obligationId = null }) {
  const message = { subject, body, obligationId };
  const pending = [];
  let written = 0;
  for (const d of deliveries) {
    if (d.channel === 'IN_APP') {
      await channels.send('IN_APP', { id: d.userId }, message, { db });
      written += 1;
    } else {
      pending.push({ userId: d.userId, channel: d.channel, subject, body, sentOn: null, obligationId });
    }
  }
  if (pending.length > 0) {
    await db.notification.createMany({ data: pending });
    written += pending.length;
  }
  return written;
}

// Sends the EMAIL / SMS rows of one obligation that are still unsent. Call it AFTER the transaction
// committed. It never throws: a failed send leaves sent_on null (logged) and is retried the next
// time this obligation has a transition. Each row is claimed first, so two runs cannot both send it.
async function dispatchPending(db, { obligationId }) {
  const rows = await db.notification.findMany({
    where: { obligationId, sentOn: null, channel: { in: ['EMAIL', 'SMS'] } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { id: 'asc' },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const claim = await db.notification.updateMany({ where: { id: row.id, sentOn: null }, data: { sentOn: new Date() } });
    if (claim.count !== 1) continue; // another run took it
    try {
      await channels.send(row.channel, row.user, { subject: row.subject, body: row.body, obligationId });
      sent += 1;
    } catch (e) {
      console.error(`[notify] ${row.channel} to user ${row.userId} failed:`, e.message);
      await db.notification.updateMany({ where: { id: row.id }, data: { sentOn: null } });
      failed += 1;
    }
  }
  return { sent, failed };
}

module.exports = { notifyInstitutionUsers, sendAlert, dispatchPending };