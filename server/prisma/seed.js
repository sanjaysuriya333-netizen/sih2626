require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { seedReference } = require('./seed/reference');
const { seedApplications } = require('./seed/applications');

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Database already has data. Run npm run reset to start fresh.');
    return;
  }
  const ref = await seedReference(prisma);
  await seedApplications(prisma, ref);
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
