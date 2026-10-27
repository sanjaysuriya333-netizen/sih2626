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

// The ONE function the daily job uses to send an alert.
// deliveries = [{ userId, channel }]. Stage 7 writes IN_APP rows only; EMAIL and SMS deliveries
// are skipped until Stage 8 replaces this body with the channel interface.
// Returns the number of notification rows written.
async function sendAlert(db, { deliveries, subject, body, obligationId = null }) {
  const now = new Date();
  const rows = deliveries
    .filter((d) => d.channel === 'IN_APP')
    .map((d) => ({ userId: d.userId, channel: 'IN_APP', subject, body, sentOn: now, obligationId }));
  if (rows.length > 0) await db.notification.createMany({ data: rows });
  return rows.length;
}

module.exports = { notifyInstitutionUsers, sendAlert };