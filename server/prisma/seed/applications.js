const { REGIONS } = require('./data');

// Small seeded random generator so every teammate gets identical data
function makeRng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same table as docs/routes.md. Stage 4 replaces this with the rules engine.
function pickRoute(routes, newOrExisting, level) {
  if (newOrExisting === 'NEW') return level === 'PG' ? routes[3] : routes[1];
  return level === 'PG' ? routes[2] : routes[0];
}

const ALERT_LEVEL = { OPEN: 0, REMINDER_SENT: 1, DUE_TODAY: 2, OVERDUE: 3, ESCALATED: 4 };

async function seedApplications(prisma, ref) {
  const { institutions, officers, heads, routes } = ref;
  const rng = makeRng(26262);
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  // 128 in-progress applications: 2 escalated, 6 overdue, 14 due soon, 106 open (due later)
  const cats = [
    ...Array(2).fill('ESCALATED'),
    ...Array(6).fill('OVERDUE'),
    ...Array(14).fill('DUE_SOON'),
    ...Array(106).fill('OPEN'),
  ];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }
  let dueSoonCount = 0;

  // Applications 1 to 22 are finished (approved, rejected or closed)
  for (let i = 1; i <= 150; i++) {
    const inst = institutions[(i - 1) % 20];
    const regionOfficers = officers.filter((o) => o.region === inst.region);
    const officer = regionOfficers[Math.floor(i / 4) % 3];
    const newOrExisting = i % 2 === 0 ? 'NEW' : 'EXISTING';
    const programmeLevel = ['UG', 'PG', 'DIPLOMA'][i % 3];
    const route = pickRoute(routes, newOrExisting, programmeLevel);
    const stages = route.stages;
    const closed = i <= 22;
    const cat = closed ? null : cats[i - 23];
    const currentIdx = closed ? stages.length - 1 : randInt(0, stages.length - 1);

    // Build stage history by walking backwards from today (or from the close date)
    const closedOn = closed ? addDays(today, -randInt(1, 60)) : null;
    const currentEntered = closed ? null : addDays(today, -randInt(1, 10));
    let end = closed ? closedOn : currentEntered;
    const history = [];
    const lastDone = closed ? stages.length - 1 : currentIdx - 1;
    for (let s = lastDone; s >= 0; s--) {
      const enteredOn = addDays(end, -randInt(2, 8));
      history.push({ stageId: stages[s].id, enteredOn, completedOn: end, completedBy: officer.id });
      end = enteredOn;
    }
    if (!closed) {
      history.push({ stageId: stages[currentIdx].id, enteredOn: currentEntered });
    }

    const status = !closed ? 'IN_PROGRESS' : i <= 16 ? 'APPROVED' : i <= 20 ? 'REJECTED' : 'CLOSED';

    const app = await prisma.application.create({
      data: {
        appCode: `APP-2026-${String(i).padStart(4, '0')}`,
        institutionId: inst.id,
        routeId: route.id,
        currentStageId: stages[currentIdx].id,
        assignedOfficerId: officer.id,
        status,
        newOrExisting,
        programmeLevel,
        submittedOn: end,
        closedOn,
        history: { create: history },
      },
    });

    if (closed) continue;

    // One STAGE obligation for the current stage. Owner follows the stage's owner_role.
    // Seeded due dates are set directly to reproduce the demo numbers (not derived from max_days).
    const stage = stages[currentIdx];
    let ownerId = officer.id;
    if (stage.ownerRole === 'SUPERVISOR') ownerId = officer.supervisorId;
    if (stage.ownerRole === 'HEAD_OFFICE') ownerId = heads[0].id;

    let offset;
    let state;
    if (cat === 'ESCALATED') {
      offset = -randInt(8, 12);
      state = 'ESCALATED';
    } else if (cat === 'OVERDUE') {
      offset = -randInt(1, 5);
      state = 'OVERDUE';
    } else if (cat === 'DUE_SOON') {
      offset = dueSoonCount++ % 7; // spreads 14 items over today .. today+6
      state = offset === 0 ? 'DUE_TODAY' : offset <= 2 ? 'REMINDER_SENT' : 'OPEN';
    } else {
      offset = randInt(8, 30);
      state = 'OPEN';
    }

    await prisma.obligation.create({
      data: {
        kind: 'STAGE',
        refId: stage.id,
        applicationId: app.id,
        ownerId,
        dueDate: addDays(today, offset),
        state,
        lastAlertLevel: ALERT_LEVEL[state],
      },
    });
  }
  console.log(`Regions used: ${REGIONS.length}`);
}

module.exports = { seedApplications };
