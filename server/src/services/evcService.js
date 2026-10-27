const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { scopeApplications } = require('./scope');
const { loadRulesContext } = require('./rulesData');
const { nextStage } = require('./rulesEngine');
const { addWorkingDays, isWorkingDay, startOfUtcDay } = require('./workingDays');
const { advanceStage, canCompleteStage } = require('./stageService');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d) => d.toISOString().slice(0, 10);

// Colour/state label for the UI: DONE, CANCELLED, LATE, DUE_SOON (within 7 days) or PLANNED
function displayStatus(visit, today = startOfUtcDay(new Date())) {
  if (visit.status === 'COMPLETED') return 'DONE';
  if (visit.status === 'CANCELLED') return 'CANCELLED';
  const planned = startOfUtcDay(visit.plannedDate);
  if (planned < today) return 'LATE';
  if (planned <= new Date(today.getTime() + 7 * DAY_MS)) return 'DUE_SOON';
  return 'PLANNED';
}

const pageArgs = ({ page, pageSize }) => ({ skip: (page - 1) * pageSize, take: pageSize });

// Files waiting for an EVC date: EVC-ready, at an EVC entry stage, no PLANNED/COMPLETED visit
async function listQueue(user, paging) {
  const where = {
    AND: [
      scopeApplications(user),
      {
        status: 'IN_PROGRESS',
        evcReadyOn: { not: null },
        currentStage: { is: { isEvcEntry: true } },
        evcVisits: { none: { status: { in: ['PLANNED', 'COMPLETED'] } } },
      },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: [{ evcReadyOn: 'asc' }, { id: 'asc' }],
      ...pageArgs(paging),
      include: {
        institution: { select: { name: true } },
        assignedOfficer: { select: { name: true } },
        currentStage: { select: { stageName: true } },
      },
    }),
  ]);
  const data = rows.map((a) => ({
    id: a.id,
    appCode: a.appCode,
    institutionName: a.institution.name,
    officerName: a.assignedOfficer ? a.assignedOfficer.name : null,
    stageName: a.currentStage ? a.currentStage.stageName : null,
    evcReadyOn: a.evcReadyOn,
  }));
  return { data, total };
}

// Visits for the calendar/list, scoped through the application
async function listVisits(user, { from, to, status, page, pageSize }) {
  const filters = {};
  if (status) filters.status = status;
  if (from || to) filters.plannedDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const where = { AND: [{ application: { is: scopeApplications(user) } }, filters] };
  const [total, rows] = await Promise.all([
    prisma.evcVisit.count({ where }),
    prisma.evcVisit.findMany({
      where,
      orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
      ...pageArgs({ page, pageSize }),
      include: {
        application: {
          select: {
            appCode: true,
            institution: { select: { name: true } },
            assignedOfficer: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  const today = startOfUtcDay(new Date());
  const data = rows.map((v) => ({
    id: v.id,
    applicationId: v.applicationId,
    appCode: v.application.appCode,
    institutionName: v.application.institution.name,
    officerName: v.application.assignedOfficer ? v.application.assignedOfficer.name : null,
    plannedDate: v.plannedDate,
    actualDate: v.actualDate,
    status: v.status,
    committeeNotes: v.committeeNotes,
    display: displayStatus(v, today),
  }));
  return { data, total };
}

// Schedules a visit: visit + EVC obligation + stage move + audit, in ONE transaction
async function scheduleVisit(user, applicationId, plannedDate) {
  const application = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, scopeApplications(user)] },
    include: { currentStage: true },
  });
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  if (application.status !== 'IN_PROGRESS') {
    throw new HttpError(409, 'ALREADY_CLOSED', 'This application is already closed');
  }
  const stage = application.currentStage;
  if (!stage || !stage.isEvcEntry) {
    throw new HttpError(409, 'NOT_EVC_READY', 'This file is not at the EVC scheduling stage');
  }
  if (!canCompleteStage(user.role, stage.ownerRole)) {
    throw new HttpError(403, 'FORBIDDEN', `Only ${stage.ownerRole} or above can schedule this visit`);
  }
  if (!application.assignedOfficerId) {
    throw new HttpError(409, 'NO_OFFICER', 'The file has no assigned officer');
  }
  const existing = await prisma.evcVisit.count({
    where: { applicationId, status: { in: ['PLANNED', 'COMPLETED'] } },
  });
  if (existing > 0) throw new HttpError(409, 'ALREADY_SCHEDULED', 'An EVC visit already exists for this file');

  const ctx = await loadRulesContext(prisma);
  const rule = await prisma.evcRule.findFirst({ where: { active: true }, orderBy: { id: 'desc' } });
  if (!rule) throw new HttpError(500, 'NO_EVC_RULE', 'No active EVC minimum-notice rule');

  const now = new Date();
  const today = startOfUtcDay(now);
  const planned = startOfUtcDay(plannedDate);
  const earliest = addWorkingDays(today, rule.minNoticeDays, ctx.holidays);
  if (planned < earliest) {
    throw new HttpError(
      400,
      'MIN_NOTICE',
      `EVC visits need at least ${rule.minNoticeDays} working days notice (earliest ${isoDay(earliest)})`,
    );
  }
  if (!isWorkingDay(planned, ctx.holidays)) {
    throw new HttpError(400, 'NOT_WORKING_DAY', 'The planned date must be a working day');
  }

  const next = nextStage({ routeId: application.routeId, currentStageId: stage.id }, ctx);
  if (!next) throw new HttpError(409, 'NO_NEXT_STAGE', 'The route has no stage after EVC scheduling');

  return prisma.$transaction(async (tx) => {
    const visit = await tx.evcVisit.create({ data: { applicationId, plannedDate: planned } });
    // The EVC obligation plugs into the daily job like a STAGE obligation (OPEN, alert level 0)
    await tx.obligation.create({
      data: {
        kind: 'EVC',
        refId: visit.id,
        applicationId,
        ownerId: application.assignedOfficerId,
        dueDate: planned,
      },
    });
    // Throws 409 if another request moved the file first (rolls back the visit too)
    const moved = await advanceStage(tx, {
      application,
      stage,
      next,
      user,
      now,
      ctx,
      auditAction: 'EVC_SCHEDULED',
      auditExtra: { visitId: visit.id, plannedDate: isoDay(planned) },
    });
    return {
      visit: { id: visit.id, applicationId, plannedDate: visit.plannedDate, status: visit.status },
      application: moved,
    };
  });
}

// Records the visit result: visit COMPLETED + obligation DONE + stage move + audit, ONE transaction
async function completeVisit(user, visitId, { actualDate, committeeNotes }) {
  const visit = await prisma.evcVisit.findFirst({
    where: { AND: [{ id: visitId }, { application: { is: scopeApplications(user) } }] },
    include: { application: { include: { currentStage: true } } },
  });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'EVC visit not found');
  if (visit.status !== 'PLANNED') {
    throw new HttpError(409, 'NOT_PLANNED', 'This visit is not in PLANNED state');
  }
  const application = visit.application;
  if (application.status !== 'IN_PROGRESS') {
    throw new HttpError(409, 'ALREADY_CLOSED', 'This application is already closed');
  }
  const stage = application.currentStage;
  if (!stage) throw new HttpError(409, 'NO_CURRENT_STAGE', 'Application has no current stage');
  if (!canCompleteStage(user.role, stage.ownerRole)) {
    throw new HttpError(403, 'FORBIDDEN', `Only ${stage.ownerRole} or above can record this visit`);
  }

  const ctx = await loadRulesContext(prisma);
  // The file must sit on the stage right after the EVC entry stage (the visit stage)
  const route = ctx.routes.find((r) => r.id === application.routeId);
  const before = route && route.stages.find((s) => s.orderNo === stage.orderNo - 1);
  if (!before || !before.isEvcEntry) {
    throw new HttpError(409, 'WRONG_STAGE', 'The file is not at the EVC visit stage');
  }
  const next = nextStage({ routeId: application.routeId, currentStageId: stage.id }, ctx);
  if (!next) throw new HttpError(409, 'NO_NEXT_STAGE', 'The route has no stage after the EVC visit');

  const now = new Date();
  const today = startOfUtcDay(now);
  const actual = actualDate ? startOfUtcDay(actualDate) : today;
  if (actual > today) throw new HttpError(400, 'VALIDATION_ERROR', 'actualDate cannot be in the future');

  return prisma.$transaction(async (tx) => {
    // Claim the visit so a double click cannot complete it twice
    const claimed = await tx.evcVisit.updateMany({
      where: { id: visit.id, status: 'PLANNED' },
      data: { status: 'COMPLETED', actualDate: actual, committeeNotes },
    });
    if (claimed.count !== 1) throw new HttpError(409, 'NOT_PLANNED', 'This visit was already recorded');

    await tx.obligation.updateMany({
      where: { kind: 'EVC', refId: visit.id, state: { not: 'DONE' } },
      data: { state: 'DONE', closedOn: now },
    });
    const moved = await advanceStage(tx, {
      application,
      stage,
      next,
      user,
      now,
      ctx,
      auditAction: 'EVC_COMPLETED',
      auditExtra: { visitId: visit.id, actualDate: isoDay(actual) },
    });
    return {
      visit: { id: visit.id, applicationId: application.id, actualDate: actual, status: 'COMPLETED', committeeNotes },
      application: moved,
    };
  });
}

module.exports = { displayStatus, listQueue, listVisits, scheduleVisit, completeVisit };