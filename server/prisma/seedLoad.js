require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Load-test data (Stage 9): 5,000 extra applications whose codes start with LOAD-.
//   npm run seed:load              adds them
//   npm run seed:load -- --clean   removes them again
// While they exist, npm run seed:check no longer matches the demo numbers and the daily check would
// send thousands of alerts. Remove them before the demo, or run npm run reset.
const prisma = new PrismaClient();

const PREFIX = 'LOAD-';
const TOTAL = 5000;
const CHUNK = 1000;
const DAY_MS = 86400000;
const ALERT_LEVEL = { OPEN: 0, REMINDER_SENT: 1, DUE_TODAY: 2, OVERDUE: 3, ESCALATED: 4 };
const ROUTE_NAMES = {
  newPg: 'EVC + SAC/SHC',
  newOther: 'Scrutiny + EVC',
  existingPg: 'Only EVC',
  existingOther: 'Only scrutiny',
};

// Same small random generator as the seed, so every laptop gets the same load data
function makeRng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Removes everything the load data created. The audit log is append-only and is never touched.
async function clean() {
  const mine = { application: { is: { appCode: { startsWith: PREFIX } } } };
  const notifications = await prisma.notification.deleteMany({ where: { obligation: { is: mine } } });
  const obligations = await prisma.obligation.deleteMany({ where: mine });
  await prisma.document.updateMany({ where: mine, data: { replacedById: null } });
  const documents = await prisma.document.deleteMany({ where: mine });
  await prisma.evcVisit.deleteMany({ where: mine });
  await prisma.undertaking.deleteMany({ where: mine });
  const history = await prisma.stageHistory.deleteMany({ where: mine });
  const applications = await prisma.application.deleteMany({ where: { appCode: { startsWith: PREFIX } } });
  console.log(
    `Removed ${applications.count} applications, ${history.count} stage rows, ${obligations.count} obligations, ` +
      `${notifications.count} notifications, ${documents.count} documents.`,
  );
}

async function load() {
  const existing = await prisma.application.count({ where: { appCode: { startsWith: PREFIX } } });
  if (existing > 0) {
    console.log(`${existing} load applications already exist. Run: npm run seed:load -- --clean`);
    return;
  }
  const started = Date.now();

  const [institutions, officers, heads, routes] = await Promise.all([
    prisma.institution.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany({ where: { role: 'OFFICER', active: true }, orderBy: { id: 'asc' } }),
    prisma.user.findMany({ where: { role: 'HEAD_OFFICE', active: true }, orderBy: { id: 'asc' } }),
    prisma.route.findMany({ include: { stages: { orderBy: { orderNo: 'asc' } } } }),
  ]);
  if (!institutions.length || !officers.length || !heads.length) {
    throw new Error('The reference data is missing. Run npm run reset first.');
  }
  const routeByName = new Map(routes.map((r) => [r.name, r]));
  for (const name of Object.values(ROUTE_NAMES)) {
    if (!routeByName.has(name)) throw new Error(`Route "${name}" not found. Run npm run reset first.`);
  }
  const officersByRegion = new Map();
  for (const o of officers) {
    if (!officersByRegion.has(o.region)) officersByRegion.set(o.region, []);
    officersByRegion.get(o.region).push(o);
  }
  for (const inst of institutions) {
    if (!officersByRegion.has(inst.region)) throw new Error(`No officer in ${inst.region}`);
  }

  // Same table as docs/routes.md (test data only; the app itself uses the rules engine)
  const pickRoute = (newOrExisting, level) =>
    routeByName.get(
      newOrExisting === 'NEW'
        ? level === 'PG' ? ROUTE_NAMES.newPg : ROUTE_NAMES.newOther
        : level === 'PG' ? ROUTE_NAMES.existingPg : ROUTE_NAMES.existingOther,
    );

  const rng = makeRng(5000);
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

  // 1. Build every application in memory: about 15% finished, the rest in progress
  const plans = [];
  for (let i = 1; i <= TOTAL; i += 1) {
    const inst = institutions[(i - 1) % institutions.length];
    const regionOfficers = officersByRegion.get(inst.region);
    const officer = regionOfficers[randInt(0, regionOfficers.length - 1)];
    const newOrExisting = rng() < 0.5 ? 'NEW' : 'EXISTING';
    const programmeLevel = ['UG', 'PG', 'DIPLOMA'][randInt(0, 2)];
    const route = pickRoute(newOrExisting, programmeLevel);
    const stages = route.stages;
    const closed = rng() < 0.15;
    const currentIdx = closed ? stages.length - 1 : randInt(0, stages.length - 1);
    const stage = stages[currentIdx];
    const closedOn = closed ? addDays(today, -randInt(1, 90)) : null;
    const entered = closed ? null : addDays(today, -randInt(1, 40));

    // Stage history, walking backwards from the close date or from today
    let end = closed ? closedOn : entered;
    const history = [];
    for (let s = closed ? stages.length - 1 : currentIdx - 1; s >= 0; s -= 1) {
      const enteredOn = addDays(end, -randInt(2, 12));
      history.push({ stageId: stages[s].id, enteredOn, completedOn: end, completedBy: officer.id });
      end = enteredOn;
    }
    if (!closed) history.push({ stageId: stage.id, enteredOn: entered, completedOn: null, completedBy: null });

    let status = 'IN_PROGRESS';
    if (closed) {
      const r = rng();
      status = r < 0.8 ? 'APPROVED' : r < 0.9 ? 'REJECTED' : 'CLOSED';
    }

    // One STAGE obligation for the current stage, like the demo seed (about 2% escalated, 5% overdue, 10% due soon)
    let obligation = null;
    if (!closed) {
      let ownerId = officer.id;
      if (stage.ownerRole === 'SUPERVISOR') ownerId = officer.supervisorId;
      if (stage.ownerRole === 'HEAD_OFFICE') ownerId = heads[0].id;
      const r = rng();
      let offset;
      let state;
      if (r < 0.02) {
        offset = -randInt(8, 12);
        state = 'ESCALATED';
      } else if (r < 0.07) {
        offset = -randInt(1, 5);
        state = 'OVERDUE';
      } else if (r < 0.17) {
        offset = randInt(0, 6);
        state = offset === 0 ? 'DUE_TODAY' : offset <= 2 ? 'REMINDER_SENT' : 'OPEN';
      } else {
        offset = randInt(8, 30);
        state = 'OPEN';
      }
      obligation = {
        kind: 'STAGE',
        refId: stage.id,
        ownerId,
        dueDate: addDays(today, offset),
        state,
        lastAlertLevel: ALERT_LEVEL[state],
      };
    }

    plans.push({
      application: {
        appCode: `${PREFIX}${String(i).padStart(5, '0')}`,
        institutionId: inst.id,
        routeId: route.id,
        currentStageId: stage.id,
        assignedOfficerId: officer.id,
        status,
        newOrExisting,
        programmeLevel,
        submittedOn: end,
        closedOn,
        evcReadyOn: !closed && stage.isEvcEntry ? entered : null,
      },
      history,
      obligation,
    });
  }

  // 2. Write in chunks (Postgres limits the number of values in one statement)
  const idByCode = new Map();
  for (const part of chunks(plans, CHUNK)) {
    const rows = await prisma.application.createManyAndReturn({
      data: part.map((p) => p.application),
      select: { id: true, appCode: true },
    });
    for (const r of rows) idByCode.set(r.appCode, r.id);
  }
  const historyRows = [];
  const obligationRows = [];
  for (const p of plans) {
    const applicationId = idByCode.get(p.application.appCode);
    for (const h of p.history) historyRows.push({ applicationId, ...h });
    if (p.obligation) obligationRows.push({ applicationId, ...p.obligation });
  }
  for (const part of chunks(historyRows, CHUNK)) await prisma.stageHistory.createMany({ data: part });
  for (const part of chunks(obligationRows, CHUNK)) await prisma.obligation.createMany({ data: part });

  console.log(
    `Added ${plans.length} applications, ${historyRows.length} stage rows and ${obligationRows.length} obligations ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)} s.`,
  );
  console.log('Remove them with: npm run seed:load -- --clean   (or npm run reset)');
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Load data is for development only');
  if (process.argv.includes('--clean')) await clean();
  else await load();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());