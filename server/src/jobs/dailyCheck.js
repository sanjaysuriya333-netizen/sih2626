const prisma = require('../utils/prisma');
// Called through the module objects so tests can spy on them (rollback tests)
const audit = require('../services/audit');
const notifyService = require('../services/notifyService');
const scheduleService = require('../services/scheduleService');
const { startOfUtcDay, loadHolidays } = require('../services/workingDays');
const { buildLadders, computeDaysToDue, pickTransition, alertMessage } = require('../services/ladder');

const isoDay = (d) => d.toISOString().slice(0, 10);

// Today's date in IST as a UTC-midnight Date (the job's default asOf)
function todayInIst(now = new Date()) {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00Z`);
}

function labelFor(ob, ctx) {
  const code = ob.application.appCode;
  if (ob.kind === 'STAGE') return `Stage "${ctx.stageNames.get(ob.refId) ?? 'stage'}" of ${code}`;
  if (ob.kind === 'EVC') return `EVC visit of ${code}`;
  if (ob.kind === 'UNDERTAKING') return `Undertaking of ${code}`;
  return `${ctx.docTypes.get(ob.refId) ?? 'Document'} of ${code}`;
}

// One transition for one obligation: state change + notifications + audit row, in ONE transaction.
// Returns null when another run got there first.
async function applyStep(tx, ob, step, daysToDue, day, ctx) {
  // Compare-and-set on last_alert_level: two runs at once cannot both fire
  const claimed = await tx.obligation.updateMany({
    where: { id: ob.id, state: { not: 'DONE' }, lastAlertLevel: ob.lastAlertLevel },
    data: { state: step.level, lastAlertLevel: step.step },
  });
  if (claimed.count !== 1) return null;

  // An overdue document is expired (its obligation stays open until it is renewed)
  let documentExpired = false;
  if (ob.kind === 'DOCUMENT' && daysToDue < 0 && ob.refId) {
    const r = await tx.document.updateMany({
      where: { id: ob.refId, status: 'VALID' },
      data: { status: 'EXPIRED' },
    });
    documentExpired = r.count === 1;
  }

  // Recipients: OWNER / SUPERVISOR / HEAD_OFFICE (supervisor, else head office of the region)
  const owners = await scheduleService.resolveOwners(tx, ob.ownerId);
  const seen = new Set();
  const deliveries = [];
  for (const rule of step.rules) {
    // OWNER means the obligation's own owner; resolveOwners has no OWNER key
    const userId = rule.recipientRole === 'OWNER' ? ob.ownerId : owners[rule.recipientRole];
    if (!userId) continue;
    const key = `${userId}|${rule.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deliveries.push({ userId, channel: rule.channel });
  }

  const message = alertMessage({
    kind: ob.kind,
    level: step.level,
    label: labelFor(ob, ctx),
    dueDate: ob.dueDate,
    daysToDue,
  });
  const notifications = await notifyService.sendAlert(tx, { ...message, deliveries, obligationId: ob.id });

  await audit.logAction(
    {
      userId: null, // the system, not a person
      action: `ALERT_${step.level}`,
      entity: 'obligation',
      entityId: ob.id,
      before: { state: ob.state, lastAlertLevel: ob.lastAlertLevel },
      after: {
        state: step.level,
        lastAlertLevel: step.step,
        kind: ob.kind,
        daysToDue,
        asOf: isoDay(day),
        notifications,
        documentExpired,
      },
    },
    tx,
  );

  return { obligationId: ob.id, kind: ob.kind, from: ob.state, to: step.level, step: step.step, notifications };
}

// Moves every open obligation along the ladder as of `asOf` (default: today in IST).
// options.obligationIds limits the run to those obligations (tests only).
async function runDailyCheck({ asOf, obligationIds } = {}) {
  const day = asOf ? startOfUtcDay(asOf) : todayInIst();
  const holidays = await loadHolidays(prisma);
  const ladders = buildLadders(await prisma.alertRule.findMany({ where: { active: true } }));

  const obligations = await prisma.obligation.findMany({
    where: { state: { not: 'DONE' }, ...(obligationIds ? { id: { in: obligationIds } } : {}) },
    orderBy: { id: 'asc' },
    include: { application: { select: { appCode: true } } },
  });

  // Names for the notification text
  const stages = await prisma.routeStage.findMany({ select: { id: true, stageName: true } });
  const docIds = obligations.filter((o) => o.kind === 'DOCUMENT' && o.refId).map((o) => o.refId);
  const docs = docIds.length
    ? await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, docType: true } })
    : [];
  const ctx = {
    stageNames: new Map(stages.map((s) => [s.id, s.stageName])),
    docTypes: new Map(docs.map((d) => [d.id, d.docType])),
  };

  const result = { asOf: isoDay(day), checked: obligations.length, fired: 0, skipped: 0, failed: 0, transitions: [], failures: [] };

  for (const ob of obligations) {
    const daysToDue = computeDaysToDue(ob.kind, ob.dueDate, day, holidays);
    const step = pickTransition(ladders[ob.kind] || [], daysToDue, ob.lastAlertLevel);
    if (!step) continue;
    try {
      const out = await prisma.$transaction((tx) => applyStep(tx, ob, step, daysToDue, day, ctx));
      if (out) {
        result.fired += 1;
        result.transitions.push(out);
        // after commit: send EMAIL / SMS rows (never throws, so it cannot fail the run)
        await notifyService.dispatchPending(prisma, { obligationId: ob.id });
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      // This obligation rolled back completely; carry on with the others
      console.error(e);
      result.failed += 1;
      result.failures.push({ obligationId: ob.id, message: e.message });
    }
  }
  return result;
}

// Runs the check and writes ONE summary audit row (who ran it, for which date, how many alerts).
// userId is null when the cron job runs it.
async function runDailyCheckAudited({ asOf, userId = null, obligationIds } = {}) {
  const result = await runDailyCheck({ asOf, obligationIds });
  await audit.logAction({
    userId,
    action: 'DAILY_CHECK_RUN',
    entity: 'daily_check',
    after: {
      asOf: result.asOf,
      checked: result.checked,
      fired: result.fired,
      skipped: result.skipped,
      failed: result.failed,
    },
  });
  return result;
}

module.exports = { runDailyCheck, runDailyCheckAudited, todayInIst };