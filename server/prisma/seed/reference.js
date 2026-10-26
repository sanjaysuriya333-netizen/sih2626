const bcrypt = require('bcrypt');
const { REGIONS, INSTITUTION_TYPES, ROUTES, HOLIDAYS, buildAlertRules } = require('./data');

// Creates institutions, users, routes + stages, holidays and alert rules
async function seedReference(prisma) {
  const passwordHash = await bcrypt.hash('Demo@1234', 10);
  const mkUser = (name, email, role, extra = {}) =>
    prisma.user.create({ data: { name, email, passwordHash, role, ...extra } });

  // 20 institutions, 5 per region
  const institutions = [];
  for (let i = 1; i <= 20; i++) {
    institutions.push(
      await prisma.institution.create({
        data: {
          name: `Demo Institute ${i}`,
          region: REGIONS[(i - 1) % 4],
          state: `State ${((i - 1) % 4) + 1}`,
          contactEmail: `contact${i}@institute${i}.test`,
          institutionType: INSTITUTION_TYPES[i % 3],
        },
      }),
    );
  }

  // 4 supervisors (one per region), 12 officers (3 per region), 2 head office
  const supervisors = [];
  for (let r = 0; r < 4; r++) {
    supervisors.push(
      await mkUser(`Supervisor ${r + 1}`, `supervisor${r + 1}@demo.test`, 'SUPERVISOR', {
        region: REGIONS[r],
      }),
    );
  }
  const officers = [];
  for (let i = 1; i <= 12; i++) {
    const r = Math.floor((i - 1) / 3);
    officers.push(
      await mkUser(`Officer ${i}`, `officer${i}@demo.test`, 'OFFICER', {
        region: REGIONS[r],
        supervisorId: supervisors[r].id,
      }),
    );
  }
  // Head office users have no region (they cover all regions)
  const heads = [];
  for (let i = 1; i <= 2; i++) {
    heads.push(await mkUser(`Head Office ${i}`, `head${i}@demo.test`, 'HEAD_OFFICE'));
  }
  // One institution contact per institution
  for (let i = 1; i <= 20; i++) {
    const inst = institutions[i - 1];
    await mkUser(`Institution ${i} Contact`, `institution${i}@demo.test`, 'INSTITUTION', {
      region: inst.region,
      institutionId: inst.id,
    });
  }

  // Routes and their ordered stages (read from data.js, never hard-coded in app code)
  const routes = [];
  for (const r of ROUTES) {
    routes.push(
      await prisma.route.create({
        data: {
          name: r.name,
          stages: {
            create: r.stages.map(([stageName, maxDays, ownerRole], idx) => ({
              stageName,
              maxDays,
              ownerRole,
              orderNo: idx + 1,
            })),
          },
        },
        include: { stages: { orderBy: { orderNo: 'asc' } } },
      }),
    );
  }

  await prisma.holiday.createMany({
    data: HOLIDAYS.map(([d, label]) => ({ date: new Date(`${d}T00:00:00Z`), label })),
  });
  await prisma.alertRule.createMany({ data: buildAlertRules() });

  return { institutions, supervisors, officers, heads, routes };
}

module.exports = { seedReference };
