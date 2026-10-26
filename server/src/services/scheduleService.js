const HttpError = require('../utils/httpError');

// Works with the normal Prisma client or a transaction client (tx)

// Who owns a stage, by owner_role. Pure lookup; owners comes from resolveOwners.
function ownerIdForRole(role, owners) {
  const id = owners[role];
  if (!id) throw new HttpError(400, 'NO_OWNER', `No owner found for role ${role}`);
  return id;
}

async function resolveOwners(db, officerId) {
  const officer = await db.user.findUnique({ where: { id: officerId } });
  if (!officer || !officer.active) {
    throw new HttpError(400, 'OFFICER_NOT_FOUND', `Assigned officer ${officerId} not found or inactive`);
  }

  // Head office for the officer's region, else the first active head-office user
  const regional = officer.region
    ? await db.user.findFirst({ where: { role: 'HEAD_OFFICE', active: true, region: officer.region } })
    : null;
  const headOffice =
    regional ||
    (await db.user.findFirst({ where: { role: 'HEAD_OFFICE', active: true }, orderBy: { id: 'asc' } }));

  return {
    OFFICER: officer.id,
    SUPERVISOR: officer.supervisorId ?? headOffice?.id, // no supervisor -> head office
    INSTITUTION: officer.id, // institution stages are tracked through the assigned officer
    HEAD_OFFICE: headOffice?.id,
  };
}

// Saves the output of buildSchedule as one STAGE obligation per stage.
// application = { id, assignedOfficerId }. Caller writes the audit row (it is not an endpoint).
async function persistSchedule(db, application, schedule) {
  const existing = await db.obligation.count({
    where: { applicationId: application.id, kind: 'STAGE' },
  });
  if (existing > 0) {
    throw new HttpError(409, 'SCHEDULE_EXISTS', 'This application already has a stage schedule');
  }

  const owners = await resolveOwners(db, application.assignedOfficerId);
  const data = schedule.stages.map((s) => ({
    kind: 'STAGE',
    refId: s.stageId, // route_stages.id
    applicationId: application.id,
    ownerId: ownerIdForRole(s.ownerRole, owners),
    dueDate: s.dueDate,
  }));
  const result = await db.obligation.createMany({ data });
  return result.count;
}

module.exports = { persistSchedule, resolveOwners, ownerIdForRole };