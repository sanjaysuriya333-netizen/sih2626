const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { logAction } = require('./audit');
const { scopeApplications } = require('./scope');
const { loadRulesContext } = require('./rulesData');
const { nextStage } = require('./rulesEngine');
const { addWorkingDays, startOfUtcDay } = require('./workingDays');
const scheduleService = require('./scheduleService'); // called via the module object so tests can spy on it

// stage owner_role -> roles allowed to complete it (the scope check still applies on top)
const CAN_COMPLETE = {
  OFFICER: ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'],
  INSTITUTION: ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'], // institution answers, the officer completes
  SUPERVISOR: ['SUPERVISOR', 'HEAD_OFFICE'],
  HEAD_OFFICE: ['HEAD_OFFICE'],
};
const canCompleteStage = (userRole, stageOwnerRole) =>
  (CAN_COMPLETE[stageOwnerRole] || []).includes(userRole);

// Re-dates every open STAGE obligation from `startDate` (chained by max_days) and
// creates the obligation of the next stage if it does not exist (seeded files).
async function rescheduleRemaining(tx, application, next, ctx, startDate) {
  const route = ctx.routes.find((r) => r.id === application.routeId);
  const remaining = [...route.stages]
    .sort((a, b) => a.orderNo - b.orderNo)
    .filter((s) => s.orderNo >= next.orderNo);
  const open = await tx.obligation.findMany({
    where: { applicationId: application.id, kind: 'STAGE', state: { not: 'DONE' } },
  });
  const byStage = new Map(open.map((o) => [o.refId, o]));

  let start = startDate;
  for (const s of remaining) {
    const dueDate = addWorkingDays(start, s.maxDays, ctx.holidays);
    const existing = byStage.get(s.id);
    if (existing) {
      await tx.obligation.update({ where: { id: existing.id }, data: { dueDate } });
    } else if (s.id === next.id) {
      const owners = await scheduleService.resolveOwners(tx, application.assignedOfficerId);
      await tx.obligation.create({
        data: {
          kind: 'STAGE',
          refId: s.id,
          applicationId: application.id,
          ownerId: scheduleService.ownerIdForRole(s.ownerRole, owners),
          dueDate,
        },
      });
    }
    start = dueDate;
  }
}

async function completeStage(user, applicationId, input) {
  // 1. Checks outside the transaction (scope first: out-of-scope files look like 404)
  const application = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, scopeApplications(user)] },
    include: { currentStage: true },
  });
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  if (application.status !== 'IN_PROGRESS') {
    throw new HttpError(409, 'ALREADY_CLOSED', 'This application is already closed');
  }
  const stage = application.currentStage;
  if (!stage) throw new HttpError(409, 'NO_CURRENT_STAGE', 'Application has no current stage');
  if (!canCompleteStage(user.role, stage.ownerRole)) {
    throw new HttpError(403, 'FORBIDDEN', `Only ${stage.ownerRole} or above can complete this stage`);
  }

  const ctx = await loadRulesContext(prisma);
  const next = nextStage({ routeId: application.routeId, currentStageId: stage.id }, ctx);
  if (!next && !input.decision) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'decision (APPROVED or REJECTED) is required on the last stage');
  }
  if (next && input.decision) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'decision is only allowed on the last stage');
  }

  const now = new Date();
  const today = startOfUtcDay(now);

  // 2. All changes in ONE transaction
  return prisma.$transaction(async (tx) => {
    // Claim the move: fails if someone completed this stage a moment ago
    const claimed = await tx.application.updateMany({
      where: { id: application.id, currentStageId: stage.id, status: 'IN_PROGRESS' },
      data: next
        ? {
            currentStageId: next.id,
            ...(next.isEvcEntry && !application.evcReadyOn ? { evcReadyOn: now } : {}),
          }
        : { status: input.decision, closedOn: now },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, 'CONFLICT', 'This stage was already completed');
    }

    // Close the open history row (create a closed one if data was inconsistent)
    const closedRows = await tx.stageHistory.updateMany({
      where: { applicationId: application.id, stageId: stage.id, completedOn: null },
      data: { completedOn: now, completedBy: user.id },
    });
    if (closedRows.count === 0) {
      await tx.stageHistory.create({
        data: {
          applicationId: application.id,
          stageId: stage.id,
          enteredOn: now,
          completedOn: now,
          completedBy: user.id,
        },
      });
    }

    // Close this stage's obligation
    await tx.obligation.updateMany({
      where: { applicationId: application.id, kind: 'STAGE', refId: stage.id, state: { not: 'DONE' } },
      data: { state: 'DONE', closedOn: now },
    });

    if (next) {
      await tx.stageHistory.create({
        data: { applicationId: application.id, stageId: next.id, enteredOn: now },
      });
      await rescheduleRemaining(tx, application, next, ctx, today);
    }

    await logAction(
      {
        userId: user.id,
        action: 'STAGE_COMPLETED',
        entity: 'application',
        entityId: application.id,
        before: { stageId: stage.id, status: 'IN_PROGRESS' },
        after: {
          nextStageId: next ? next.id : null,
          status: next ? 'IN_PROGRESS' : input.decision,
          remarks: input.remarks ?? null,
        },
      },
      tx,
    );

    return {
      id: application.id,
      appCode: application.appCode,
      status: next ? 'IN_PROGRESS' : input.decision,
      currentStageId: next ? next.id : stage.id,
      nextStage: next
        ? { id: next.id, orderNo: next.orderNo, stageName: next.stageName, ownerRole: next.ownerRole }
        : null,
      evcReady: Boolean(application.evcReadyOn) || Boolean(next && next.isEvcEntry),
      closedOn: next ? null : now,
    };
  });
}

module.exports = { completeStage, canCompleteStage };