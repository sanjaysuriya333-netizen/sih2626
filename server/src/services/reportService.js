const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { buildWhere } = require('./dashboardService'); // data scope + region/stage/due filters
const { startOfUtcDay } = require('./workingDays');
const { todayInIst } = require('../jobs/dailyCheck');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COMPLIANCE_FILES = 1000; // keeps the CSV and the id lists a sensible size
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);

// type: 'date' | 'datetime' | 'state' tells the screen how to show a cell. The CSV uses raw values.
const COLUMNS = {
  pending: [
    { key: 'appCode', label: 'Application' },
    { key: 'institution', label: 'Institution' },
    { key: 'region', label: 'Region' },
    { key: 'route', label: 'Route' },
    { key: 'stage', label: 'Current stage' },
    { key: 'officer', label: 'Officer' },
    { key: 'submittedOn', label: 'Submitted', type: 'date' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'daysToDue', label: 'Days to due' },
    { key: 'state', label: 'State', type: 'state' },
  ],
  overdue: [
    { key: 'kind', label: 'Kind' },
    { key: 'appCode', label: 'Application' },
    { key: 'institution', label: 'Institution' },
    { key: 'region', label: 'Region' },
    { key: 'item', label: 'Item' },
    { key: 'owner', label: 'Owner' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'daysOverdue', label: 'Days overdue' },
    { key: 'state', label: 'State', type: 'state' },
  ],
  compliance: [
    { key: 'appCode', label: 'Application' },
    { key: 'institution', label: 'Institution' },
    { key: 'region', label: 'Region' },
    { key: 'type', label: 'Type' },
    { key: 'event', label: 'Event' },
    { key: 'at', label: 'When', type: 'datetime' },
    { key: 'by', label: 'By' },
    { key: 'detail', label: 'Detail' },
  ],
};

// IN_PROGRESS files with the due date and state of the stage they are at now
async function pendingRows(user, f) {
  const today = todayInIst();
  const where = await buildWhere(user, f);
  where.AND.push({ status: 'IN_PROGRESS' });
  const [apps, obligations] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        institution: { select: { name: true, region: true } },
        route: { select: { name: true } },
        currentStage: { select: { stageName: true } },
        assignedOfficer: { select: { name: true } },
      },
    }),
    prisma.obligation.findMany({
      where: { kind: 'STAGE', state: { not: 'DONE' }, application: { is: where } },
      select: { applicationId: true, refId: true, dueDate: true, state: true },
    }),
  ]);
  const current = new Map();
  const stageOf = new Map(apps.map((a) => [a.id, a.currentStageId]));
  for (const o of obligations) if (o.refId === stageOf.get(o.applicationId)) current.set(o.applicationId, o);

  const rows = apps.map((a) => {
    const o = current.get(a.id);
    return {
      appCode: a.appCode,
      institution: a.institution.name,
      region: a.institution.region,
      route: a.route ? a.route.name : null,
      stage: a.currentStage ? a.currentStage.stageName : null,
      officer: a.assignedOfficer ? a.assignedOfficer.name : null,
      submittedOn: iso(a.submittedOn),
      dueDate: o ? iso(o.dueDate) : null,
      daysToDue: o ? daysBetween(today, o.dueDate) : null,
      state: o ? o.state : null,
    };
  });
  // earliest due date first, files without a live obligation last
  return rows.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.appCode.localeCompare(b.appCode));
}

// Open obligations (any kind) in OVERDUE, ESCALATED or REPORTED. The date filter applies to the item's own due date.
async function overdueRows(user, f) {
  const today = todayInIst();
  const where = await buildWhere(user, { region: f.region, stage: f.stage });
  const dueDate = {};
  if (f.dueFrom) dueDate.gte = f.dueFrom;
  if (f.dueTo) dueDate.lte = new Date(f.dueTo.getTime() + DAY_MS - 1);
  const obs = await prisma.obligation.findMany({
    where: {
      state: { in: ['OVERDUE', 'ESCALATED', 'REPORTED'] },
      ...(Object.keys(dueDate).length ? { dueDate } : {}),
      application: { is: where },
    },
    include: {
      owner: { select: { name: true } },
      application: {
        select: { appCode: true, status: true, currentStageId: true, institution: { select: { name: true, region: true } } },
      },
    },
  });
  // A STAGE obligation counts only for the stage the file is at now (same rule as the dashboard)
  const live = obs.filter(
    (o) => o.kind !== 'STAGE' || (o.application.status === 'IN_PROGRESS' && o.refId === o.application.currentStageId),
  );

  const stageIds = live.filter((o) => o.kind === 'STAGE').map((o) => o.refId);
  const docIds = live.filter((o) => o.kind === 'DOCUMENT' && o.refId).map((o) => o.refId);
  const [stages, docs] = await Promise.all([
    stageIds.length ? prisma.routeStage.findMany({ where: { id: { in: stageIds } }, select: { id: true, stageName: true } }) : [],
    docIds.length ? prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, docType: true } }) : [],
  ]);
  const stageName = new Map(stages.map((s) => [s.id, s.stageName]));
  const docType = new Map(docs.map((d) => [d.id, d.docType]));
  const item = (o) => {
    if (o.kind === 'STAGE') return `Stage: ${stageName.get(o.refId) ?? 'stage'}`;
    if (o.kind === 'EVC') return 'EVC visit';
    if (o.kind === 'UNDERTAKING') return 'Undertaking';
    return docType.get(o.refId) ?? 'Document';
  };

  return live
    .map((o) => ({
      kind: o.kind,
      appCode: o.application.appCode,
      institution: o.application.institution.name,
      region: o.application.institution.region,
      item: item(o),
      owner: o.owner.name,
      dueDate: iso(o.dueDate),
      daysOverdue: daysBetween(o.dueDate, today),
      state: o.state,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.appCode.localeCompare(b.appCode));
}

// Full history of the given files as one flat list of events
async function complianceEvents(apps) {
  if (apps.length === 0) return [];
  const ids = apps.map((a) => a.id);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const inApps = { applicationId: { in: ids } };
  const [history, obligations, undertakings, visits, documents, appAudit] = await Promise.all([
    prisma.stageHistory.findMany({
      where: inApps,
      include: { stage: { select: { stageName: true } }, completer: { select: { name: true } } },
    }),
    prisma.obligation.findMany({ where: inApps, select: { id: true, applicationId: true, kind: true } }),
    prisma.undertaking.findMany({ where: inApps }),
    prisma.evcVisit.findMany({ where: inApps }),
    prisma.document.findMany({ where: inApps }),
    prisma.auditLog.findMany({
      where: { entity: 'application', entityId: { in: ids } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  const obById = new Map(obligations.map((o) => [o.id, o]));
  const alerts = obligations.length
    ? await prisma.auditLog.findMany({
        where: { entity: 'obligation', entityId: { in: obligations.map((o) => o.id) }, action: { startsWith: 'ALERT_' } },
        orderBy: { id: 'asc' },
      })
    : [];

  const events = [];
  const add = (appId, type, event, at, by = '', detail = '') => {
    const app = byId.get(appId);
    events.push({
      appCode: app.appCode,
      institution: app.institution.name,
      region: app.institution.region,
      type,
      event,
      at: at.toISOString(),
      by: by || '',
      detail,
    });
  };

  for (const h of history) {
    add(h.applicationId, 'STAGE', `Entered stage: ${h.stage.stageName}`, h.enteredOn);
    if (h.completedOn) {
      add(h.applicationId, 'STAGE', `Completed stage: ${h.stage.stageName}`, h.completedOn, h.completer ? h.completer.name : '');
    }
  }
  for (const a of appAudit) add(a.entityId, 'AUDIT', a.action, a.at, a.user ? a.user.name : 'System');
  for (const a of alerts) {
    const ob = obById.get(a.entityId);
    const detail = `${ob.kind} obligation #${ob.id}: ${a.beforeJson?.state ?? '?'} to ${a.afterJson?.state ?? '?'} (as of ${a.afterJson?.asOf ?? '?'})`;
    add(ob.applicationId, 'ALERT', a.action, a.at, 'System', detail);
  }
  for (const u of undertakings) add(u.applicationId, 'UNDERTAKING', `Undertaking due: ${u.description}`, u.dueDate, '', `Status ${u.status}`);
  for (const v of visits) add(v.applicationId, 'EVC', `EVC visit ${v.status}`, v.actualDate ?? v.plannedDate, '', `Planned ${iso(v.plannedDate)}`);
  for (const d of documents) add(d.applicationId, 'DOCUMENT', `${d.docType}: ${d.status}`, d.validUntil, '', 'Expiry date');

  return events.sort((a, b) => a.appCode.localeCompare(b.appCode) || a.at.localeCompare(b.at));
}

// Pages are FILES; each file brings all its events. paging = null means everything (CSV).
async function complianceRows(user, f, paging) {
  const where = await buildWhere(user, { region: f.region, stage: f.stage });
  const total = await prisma.application.count({ where });
  if (!paging && total > MAX_COMPLIANCE_FILES) {
    throw new HttpError(400, 'TOO_MANY_ROWS', `The compliance report covers up to ${MAX_COMPLIANCE_FILES} files; ${total} match. Filter by region or stage.`);
  }
  const apps = await prisma.application.findMany({
    where,
    orderBy: { appCode: 'asc' },
    ...(paging ? { skip: (paging.page - 1) * paging.pageSize, take: paging.pageSize } : {}),
    include: { institution: { select: { name: true, region: true } } },
  });
  return { rows: await complianceEvents(apps), total };
}

// type: pending | overdue | compliance. f = { region, stage, dueFrom, dueTo } (dates are Date objects).
// paging = { page, pageSize } for the screen, null for the full CSV.
async function getReport(user, type, f, paging) {
  if (type === 'compliance') {
    const { rows, total } = await complianceRows(user, f, paging);
    return { columns: COLUMNS.compliance, rows, total };
  }
  const all = await (type === 'pending' ? pendingRows : overdueRows)(user, f);
  const rows = paging ? all.slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize) : all;
  return { columns: COLUMNS[type], rows, total: all.length };
}

module.exports = { getReport, COLUMNS, MAX_COMPLIANCE_FILES };