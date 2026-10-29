require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekEnd = new Date(today.getTime() + 6 * 86400000);

  const result = {
    inProgress: await prisma.application.count({ where: { status: 'IN_PROGRESS' } }),
    dueThisWeek: await prisma.obligation.count({
      where: {
        kind: 'STAGE',
        state: { in: ['OPEN', 'REMINDER_SENT', 'DUE_TODAY'] },
        dueDate: { gte: today, lte: weekEnd },
      },
    }),
    overdue: await prisma.obligation.count({ where: { state: 'OVERDUE' } }),
    escalated: await prisma.obligation.count({ where: { state: 'ESCALATED' } }),
  };
  const expected = { inProgress: 128, dueThisWeek: 14, overdue: 6, escalated: 2 };

  console.table({ expected, actual: result });
  console.log(
    'users:',
    await prisma.user.count(),
    '| applications:',
    await prisma.application.count(),
  );
  // Stage 7 info line (not part of the pass/fail check)
  console.log(
    'documents:',
    await prisma.document.count(),
    '| document obligations:',
    await prisma.obligation.count({ where: { kind: 'DOCUMENT' } }),
    '| DOCUMENT reminder rules (IN_APP):',
    await prisma.alertRule.count({ where: { kind: 'DOCUMENT', level: 'REMINDER_SENT', channel: 'IN_APP' } }),
  );

  const ok = Object.keys(expected).every((k) => expected[k] === result[k]);
  console.log(ok ? 'DEMO NUMBERS OK' : 'DEMO NUMBERS MISMATCH');
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
