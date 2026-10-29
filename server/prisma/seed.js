require('dotenv').config();
const { seedEvcReady } = require('./seed/evcReady');
const { seedEvcRules } = require('./seed/evcRules');
const { seedDocuments } = require('./seed/documents');
const { PrismaClient } = require('@prisma/client');
const { seedReference } = require('./seed/reference');
const { seedApplications } = require('./seed/applications');
const { seedRouteRules } = require('./seed/routeRules');

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Database already has data. Run npm run reset to start fresh.');
    return;
  }
  const ref = await seedReference(prisma);
  await seedRouteRules(prisma);
  await seedEvcRules(prisma);
  await seedApplications(prisma, ref);
  await seedDocuments(prisma);
  await seedEvcReady(prisma);
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());