const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { logAction } = require('./audit');
const { loadRulesContext } = require('./rulesData');
const { buildSchedule } = require('./rulesEngine');
const scheduleService = require('./scheduleService'); // called as scheduleService.persistSchedule so tests can spy on it
const { startOfUtcDay } = require('./workingDays');

// Arbitrary number used as a Postgres advisory lock key: one application is numbered at a time
const APP_CODE_LOCK = 26262;

// APP-2026-0001 style (matches the seed); highest existing number for that year + 1
async function nextAppCode(db, year) {
  const prefix = `APP-${year}-`;
  const rows = await db.application.findMany({
    where: { appCode: { startsWith: prefix } },
    select: { appCode: true },
  });
  const max = rows.reduce((m, r) => {
    const n = Number(r.appCode.slice(prefix.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// Who gets the file: see docs/api-contract.md (POST /api/applications)
async function resolveOfficer(db, user, input, institution) {
  if (user.role === 'OFFICER') return user.id;

  if (user.role === 'SUPERVISOR' || user.role === 'HEAD_OFFICE') {
    if (!input.assignedOfficerId) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'assignedOfficerId is required for this role');
    }
    const teamOnly = user.role === 'SUPERVISOR' ? { supervisorId: user.id } : {};
    const officer = await db.user.findFirst({
      where: { id: input.assignedOfficerId, role: 'OFFICER', active: true, ...teamOnly },
    });
    if (!officer) throw new HttpError(403, 'FORBIDDEN', 'Officer not found or not in your team');
    return officer.id;
  }

  // INSTITUTION: the active officer in the institution's region with the fewest open files
  const officers = await db.user.findMany({
    where: { role: 'OFFICER', active: true, region: institution.region },
    select: {
      id: true,
      _count: { select: { assignedApplications: { where: { status: 'IN_PROGRESS' } } } },
    },
  });
  if (officers.length === 0) {
    throw new HttpError(409, 'NO_OFFICER_AVAILABLE', 'No officer is available for this region');
  }
  officers.sort((a, b) => a._count.assignedApplications - b._count.assignedApplications || a.id - b.id);
  return officers[0].id;
}

// Creates the application, its first stage_history row, all STAGE obligations and the
// audit row in ONE transaction: if any part fails, nothing is saved.
async function createApplication(user, input) {
  const institutionId = user.role === 'INSTITUTION' ? user.institutionId : input.institutionId;
  if (!institutionId) throw new HttpError(400, 'VALIDATION_ERROR', 'institutionId is required');
  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) throw new HttpError(404, 'NOT_FOUND', 'Institution not found');

  const submittedOn = startOfUtcDay(input.submittedOn ?? new Date());
  const ctx = await loadRulesContext(prisma);
  const schedule = buildSchedule(
    {
      institutionType: institution.institutionType,
      newOrExisting: input.newOrExisting,
      programmeLevel: input.programmeLevel,
    },
    submittedOn,
    ctx,
  );
  const first = schedule.stages[0];
  const route = ctx.routes.find((r) => r.id === schedule.routeId);
  const firstStage = route.stages.find((s) => s.id === first.stageId);

  try {
    return await prisma.$transaction(async (tx) => {
      const assignedOfficerId = await resolveOfficer(tx, user, input, institution);
      // Wait for any other in-flight create to commit, so we see its code (lock frees at commit/rollback)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${APP_CODE_LOCK})`;
      const appCode = await nextAppCode(tx, submittedOn.getUTCFullYear());
      const application = await tx.application.create({
        data: {
          appCode,
          institutionId,
          routeId: schedule.routeId,
          currentStageId: first.stageId,
          assignedOfficerId,
          newOrExisting: input.newOrExisting,
          programmeLevel: input.programmeLevel,
          submittedOn,
          evcReadyOn: firstStage.isEvcEntry ? submittedOn : null,
        },
      });
      await tx.stageHistory.create({
        data: { applicationId: application.id, stageId: first.stageId, enteredOn: submittedOn },
      });
      await scheduleService.persistSchedule(tx, application, schedule);
      await logAction(
        {
          userId: user.id,
          action: 'APPLICATION_CREATED',
          entity: 'application',
          entityId: application.id,
          after: { appCode, routeId: schedule.routeId, institutionId, assignedOfficerId },
        },
        tx,
      );
      return {
        id: application.id,
        appCode,
        status: application.status,
        routeId: schedule.routeId,
        routeName: schedule.routeName,
        currentStageId: first.stageId,
        assignedOfficerId,
        institutionId,
        submittedOn,
        stages: schedule.stages.map((s) => ({
          orderNo: s.orderNo,
          stageName: s.stageName,
          ownerRole: s.ownerRole,
          dueDate: s.dueDate,
        })),
      };
    });
  } catch (e) {
    if (e.code === 'P2002') throw new HttpError(409, 'CONFLICT', 'Application code clash, please retry');
    throw e;
  }
}

module.exports = { createApplication };