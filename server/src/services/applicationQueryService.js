const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { scopeApplications } = require('./scope');
const { canCompleteStage } = require('./stageService');

const COMPLETER_ROLES = ['OFFICER', 'SUPERVISOR', 'HEAD_OFFICE'];

// Same rule as POST .../stages/complete, so the UI can show or hide the button
const canComplete = (user, application, stage) =>
  application.status === 'IN_PROGRESS' &&
  Boolean(stage) &&
  COMPLETER_ROLES.includes(user.role) &&
  canCompleteStage(user.role, stage.ownerRole);

// Files whose CURRENT stage obligation is due inside [from, to] (whole days, UTC).
// A later stage's due date must not match, so we compare refId with current_stage_id here.
async function idsDueInRange(where, from, to) {
  const dueDate = {};
  if (from) dueDate.gte = from;
  if (to) dueDate.lte = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
  const rows = await prisma.obligation.findMany({
    where: { kind: 'STAGE', state: { not: 'DONE' }, dueDate, application: { is: where } },
    select: { applicationId: true, refId: true, application: { select: { currentStageId: true } } },
  });
  return rows.filter((r) => r.refId === r.application.currentStageId).map((r) => r.applicationId);
}

async function listApplications(user, q) {
  const filters = [];
  if (q.status) filters.push({ status: q.status });
  if (q.officerId) filters.push({ assignedOfficerId: q.officerId });
  if (q.region) filters.push({ institution: { region: q.region } });
  if (q.stage) filters.push({ currentStage: { stageName: q.stage } });
  const where = { AND: [scopeApplications(user), ...filters] };

  if (q.dueFrom || q.dueTo) {
    const ids = await idsDueInRange(where, q.dueFrom, q.dueTo);
    where.AND.push({ id: { in: ids } });
  }

  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        institution: { select: { id: true, name: true, region: true } },
        route: { select: { name: true } },
        currentStage: { select: { id: true, stageName: true, ownerRole: true } },
        assignedOfficer: { select: { id: true, name: true } },
      },
    }),
  ]);

  // The obligation of each file's current stage gives its next due date and state
  const byId = new Map(rows.map((r) => [r.id, r]));
  const open = rows.length
    ? await prisma.obligation.findMany({
        where: { applicationId: { in: rows.map((r) => r.id) }, kind: 'STAGE', state: { not: 'DONE' } },
      })
    : [];
  const current = new Map();
  for (const o of open) {
    if (o.refId === byId.get(o.applicationId).currentStageId) current.set(o.applicationId, o);
  }

  const data = rows.map((r) => {
    const o = current.get(r.id);
    return {
      id: r.id,
      appCode: r.appCode,
      status: r.status,
      institution: r.institution,
      routeName: r.route ? r.route.name : null,
      currentStage: r.currentStage,
      officer: r.assignedOfficer,
      submittedOn: r.submittedOn,
      evcReadyOn: r.evcReadyOn,
      nextDueDate: o ? o.dueDate : null,
      obligationState: o ? o.state : null,
      canComplete: canComplete(user, r, r.currentStage),
    };
  });
  return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
}

async function getApplication(user, id) {
  const application = await prisma.application.findFirst({
    where: { AND: [{ id }, scopeApplications(user)] },
    include: {
      institution: { select: { id: true, name: true, region: true, institutionType: true } },
      route: { include: { stages: { orderBy: { orderNo: 'asc' } } } },
      assignedOfficer: { select: { id: true, name: true, email: true } },
      currentStage: true,
      history: { orderBy: { id: 'asc' }, include: { completer: { select: { id: true, name: true } } } },
      obligations: { where: { kind: 'STAGE' }, orderBy: { id: 'asc' } },
    },
  });
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Application not found');

  const stages = application.route ? application.route.stages : [];
  const timeline = stages.map((s) => {
    const entries = application.history.filter((h) => h.stageId === s.id);
    const h = entries[entries.length - 1];
    const ob = application.obligations.filter((o) => o.refId === s.id).pop();
    let state = 'UPCOMING';
    if (h && h.completedOn) state = 'DONE';
    else if (s.id === application.currentStageId && application.status === 'IN_PROGRESS') state = 'CURRENT';
    return {
      stageId: s.id,
      orderNo: s.orderNo,
      stageName: s.stageName,
      ownerRole: s.ownerRole,
      maxDays: s.maxDays,
      state,
      enteredOn: h ? h.enteredOn : null,
      completedOn: h ? h.completedOn : null,
      completedBy: h && h.completer ? h.completer : null,
      dueDate: ob ? ob.dueDate : null,
      obligationState: ob ? ob.state : null,
    };
  });
  const lastOrder = stages.length ? stages[stages.length - 1].orderNo : null;

  return {
    id: application.id,
    appCode: application.appCode,
    status: application.status,
    newOrExisting: application.newOrExisting,
    programmeLevel: application.programmeLevel,
    submittedOn: application.submittedOn,
    closedOn: application.closedOn,
    evcReadyOn: application.evcReadyOn,
    institution: application.institution,
    route: application.route ? { id: application.route.id, name: application.route.name } : null,
    officer: application.assignedOfficer,
    currentStage: application.currentStage
      ? {
          id: application.currentStage.id,
          stageName: application.currentStage.stageName,
          ownerRole: application.currentStage.ownerRole,
        }
      : null,
    isLastStage: Boolean(application.currentStage) && application.currentStage.orderNo === lastOrder,
    canComplete: canComplete(user, application, application.currentStage),
    timeline,
  };
}

// Values for the filter dropdowns (officers are limited to the caller's scope)
// Values for the filter dropdowns and the new-application form (limited to the caller's scope)
async function getFilterOptions(user) {
  let officerWhere = null;
  if (user.role === 'OFFICER') officerWhere = { id: user.id };
  else if (user.role === 'SUPERVISOR') officerWhere = { role: 'OFFICER', active: true, supervisorId: user.id };
  else if (user.role === 'HEAD_OFFICE') officerWhere = { role: 'OFFICER', active: true };

  const [stageRows, regionRows, officers, institutions] = await Promise.all([
    prisma.routeStage.findMany({ distinct: ['stageName'], orderBy: [{ orderNo: 'asc' }, { stageName: 'asc' }], select: { stageName: true } }),
    prisma.institution.findMany({ distinct: ['region'], orderBy: { region: 'asc' }, select: { region: true } }),
    officerWhere
      ? prisma.user.findMany({ where: officerWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : [],
    // institutions pick their own institution automatically, so they get no list
    user.role === 'INSTITUTION'
      ? []
      : prisma.institution.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, region: true } }),
  ]);
  return {
    stages: stageRows.map((s) => s.stageName),
    regions: regionRows.map((r) => r.region),
    officers,
    institutions,
    statuses: ['IN_PROGRESS', 'APPROVED', 'REJECTED', 'CLOSED'],
  };
}

module.exports = { listApplications, getApplication, getFilterOptions };