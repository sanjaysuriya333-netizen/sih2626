// Usage: npm run portal:sync [path-to-csv]   (default: samples/portal-sync.csv)
require('dotenv/config');
const prisma = require('../src/utils/prisma');
const { runPortalSync } = require('../src/services/portalSyncMock');

async function main() {
  const actor = await prisma.user.findFirst({ where: { role: 'HEAD_OFFICE', active: true }, orderBy: { id: 'asc' } });
  if (!actor) throw new Error('No head-office user found (run npm run reset first)');
  const user = {
    id: actor.id,
    role: actor.role,
    region: actor.region,
    institutionId: actor.institutionId,
    supervisorId: actor.supervisorId,
  };
  const result = await runPortalSync(user, process.argv[2]);
  console.log(`Portal sync (mock) as ${actor.email}: ${result.imported} imported, ${result.failed} failed, ${result.total} rows`);
  result.created.forEach((c) => console.log(`  row ${c.row} -> ${c.appCode}`));
  result.errors.forEach((e) => console.log(`  ERROR row ${e.row}, ${e.field}: ${e.message}`));
  console.log('Note: this adds real files. Run npm run reset to restore the demo numbers.');
}

main()
  .catch((e) => {
    console.error(`Error ${e.code || ''}: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());