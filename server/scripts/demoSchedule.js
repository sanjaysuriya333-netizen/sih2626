// Prints the route and the dated stage list for a sample application.
// Usage: node scripts/demoSchedule.js [NEW|EXISTING] [UG|PG|DIPLOMA] [startDate] [GOVERNMENT|PRIVATE|AUTONOMOUS]
require('dotenv/config');
const prisma = require('../src/utils/prisma');
const { loadRulesContext } = require('../src/services/rulesData');
const { buildSchedule } = require('../src/services/rulesEngine');

async function main() {
  const [newOrExisting = 'NEW', programmeLevel = 'UG', start, institutionType = 'PRIVATE'] = process.argv.slice(2);
  const startDate = start || new Date().toISOString().slice(0, 10);
  const application = { institutionType, newOrExisting, programmeLevel };

  const ctx = await loadRulesContext(prisma);
  const schedule = buildSchedule(application, startDate, ctx);

  console.log('Application:', application);
  console.log(`Start date: ${startDate}`);
  console.log(`Route: ${schedule.routeName}\n`);
  console.table(
    schedule.stages.map((s) => ({
      order: s.orderNo,
      stage: s.stageName,
      owner: s.ownerRole,
      maxDays: s.maxDays,
      start: s.startDate.toISOString().slice(0, 10),
      due: s.dueDate.toISOString().slice(0, 10),
    })),
  );
}

main()
  .catch((e) => {
    console.error(`Error ${e.code || ''}: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());