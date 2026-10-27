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

module.exports = { notifyInstitutionUsers };