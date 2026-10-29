const prisma = require('../utils/prisma');
const { scopeApplications } = require('./scope');
const { startOfUtcDay } = require('./workingDays');
const { todayInIst } = require('../jobs/dailyCheck');

const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS = ['STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT'];
const OPEN_STATES = ['OPEN', 'REMINDER_SENT', 'DUE_TODAY'];
const isoDay = (d) => d.toISOString().slice(0, 10);

// Ageing buckets (calendar days since submission, IN_PROGRESS files only)
const AGEING = [
  { label: '0-7 days', max: 7 },
  { label: '8-14 days', max: 14 },
  { label: '15-30 days', max: 30 },
  { label: '31-60 days', max: 60 },
  { label: '61+ days', max: Infinity },
];

// Files whose CURRENT stage obligation is due inside [from, to] (same rule as GET /api/applications)
async function idsDueInRange(where, from, to) {
  const dueDate = {};
  if (from) dueDate.gte = from;
  if (to) dueDate.lte = new Date(to.getTime() + DAY_MS - 1);
  const rows = await prisma.obligation.findMany({
    where: { kind: 'STAGE', state: { not: 'DONE' }, dueDate, application: { is: where } },
    select: { applicationId: true, refId: true, application: { select: { currentStageId: true } } },
  });
  return rows.filter((r) => r.refId === r.application.currentStageId).map((r) => r.applicationId);
}

// The application filter every dashboard number uses: data scope first, then the optional filters
async function buildWhere(user, f = {}) {
  const filters = [];
  if (f.region) filters.push({ institution: { region: f.region } });
  if (f.stage) filters.push({ currentStage: { stageName: f.stage } });
  const where = { AND: [scopeApplications(user), ...filters] };
  if (f.dueFrom || f.dueTo) {
    where.AND.push({ id: { in: await idsDueInRange(where, f.dueFrom, f.dueTo) } });
  }
  return where;
}

// Scoped applications plus their LIVE open obligations. A STAGE obligation is live only when it is
// the obligation of the stage the file is at now (the schedule creates one per stage at submission).
async function loadContext(user, f) {
  const today = todayInIst();
  const where = await buildWhere(user, f);
  const [apps, open] = await Promise.all([
    prisma.application.findMany({
      where,
      select: {
        id: true,
        status: true,
        submittedOn: true,
        currentStageId: true,
        currentStage: { select: { stageName: true } },
        institution: { select: { id: true, name: true, region: true } },
        assignedOfficer: { select: { id: true, name: true } },
      },
    }),
    prisma.obligation.findMany({
      where: { state: { not: 'DONE' }, application: { is: where } },
      select: { kind: true, refId: true, state: true, dueDate: true, applicationId: true },
    }),
  ]);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const live = open.filter((o) => {
    if (o.kind !== 'STAGE') return true;
    const a = byId.get(o.applicationId);
    return a && a.status === 'IN_PROGRESS' && o.refId === a.currentStageId;
  });
  return { today, apps, live };
}

// Headline numbers (same rules as npm run seed:check) plus counts per kind and state
async function getSummary(user, f) {
  const { today, apps, live } = await loadContext(user, f);
  const t = (d) => d.getTime();
  const weekEnd = t(today) + 6 * DAY_MS; // today .. today + 6, like the seed check
  const stage = live.filter((o) => o.kind === 'STAGE' && OPEN_STATES.includes(o.state));
  const countState = (s) => live.filter((o) => o.state === s).length;

  const byKind = Object.fromEntries(KINDS.map((k) => [k, {}]));
  for (const o of live) byKind[o.kind][o.state] = (byKind[o.kind][o.state] || 0) + 1;
  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  return {
    asOf: isoDay(today),
    inProgress: byStatus.IN_PROGRESS || 0,
    dueToday: stage.filter((o) => t(o.dueDate) === t(today)).length,
    dueThisWeek: stage.filter((o) => t(o.dueDate) >= t(today) && t(o.dueDate) <= weekEnd).length,
    overdue: countState('OVERDUE'),
    escalated: countState('ESCALATED'),
    reported: countState('REPORTED'),
    byStatus,
    byKind,
  };
}

const GROUPERS = {
  status: (a) => ({ key: a.status, label: a.status }),
  stage: (a) => {
    const name = a.currentStage ? a.currentStage.stageName : 'No stage';
    return { key: name, label: name };
  },
  region: (a) => ({ key: a.institution.region, label: a.institution.region }),
  institution: (a) => ({ key: a.institution.id, label: a.institution.name }),
  officer: (a) =>
    a.assignedOfficer
      ? { key: a.assignedOfficer.id, label: a.assignedOfficer.name }
      : { key: 0, label: 'Unassigned' },
};

// Files grouped by status, stage, region, institution or officer. Everything except `status`
// counts IN_PROGRESS files only (pending work). overdue / escalated come from the file's current stage.
async function getBreakdown(user, by, f) {
  const { apps, live } = await loadContext(user, f);
  const stageState = new Map(live.filter((o) => o.kind === 'STAGE').map((o) => [o.applicationId, o.state]));
  const rows = by === 'status' ? apps : apps.filter((a) => a.status === 'IN_PROGRESS');
  const groups = new Map();
  for (const a of rows) {
    const { key, label } = GROUPERS[by](a);
    if (!groups.has(key)) groups.set(key, { key, label, total: 0, overdue: 0, escalated: 0 });
    const g = groups.get(key);
    g.total += 1;
    const s = stageState.get(a.id);
    if (s === 'OVERDUE') g.overdue += 1;
    else if (s === 'ESCALATED' || s === 'REPORTED') g.escalated += 1;
  }
  return [...groups.values()].sort((x, y) => y.total - x.total || String(x.label).localeCompare(String(y.label)));
}

// Ageing buckets for IN_PROGRESS files (calendar days since submitted_on)
async function getAgeing(user, f) {
  const { today, apps } = await loadContext(user, f);
  const buckets = AGEING.map((b) => ({ label: b.label, count: 0 }));
  let total = 0;
  for (const a of apps) {
    if (a.status !== 'IN_PROGRESS') continue;
    const days = Math.max(0, Math.floor((today.getTime() - startOfUtcDay(a.submittedOn).getTime()) / DAY_MS));
    buckets[AGEING.findIndex((b) => days <= b.max)].count += 1;
    total += 1;
  }
  return { buckets, total };
}

// Average calendar days per stage, from CLOSED stage_history rows (entered_on to completed_on)
async function getStageDurations(user, f) {
  const where = await buildWhere(user, f);
  const rows = await prisma.stageHistory.findMany({
    where: { completedOn: { not: null }, application: { is: where } },
    select: { enteredOn: true, completedOn: true, stage: { select: { stageName: true, orderNo: true } } },
  });
  const groups = new Map();
  for (const r of rows) {
    const name = r.stage.stageName;
    if (!groups.has(name)) groups.set(name, { stageName: name, orderNo: r.stage.orderNo, count: 0, days: 0 });
    const g = groups.get(name);
    g.orderNo = Math.min(g.orderNo, r.stage.orderNo); // the same name can sit at different positions on different routes
    g.count += 1;
    g.days += (r.completedOn.getTime() - r.enteredOn.getTime()) / DAY_MS;
  }
  return [...groups.values()]
    .sort((a, b) => a.orderNo - b.orderNo || a.stageName.localeCompare(b.stageName))
    .map((g) => ({ stageName: g.stageName, count: g.count, avgDays: Math.round((g.days / g.count) * 10) / 10 }));
}

module.exports = { getSummary, getBreakdown, getAgeing, getStageDurations, buildWhere };