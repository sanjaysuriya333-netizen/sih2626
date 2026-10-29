require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');
const { todayInIst } = require('../src/jobs/dailyCheck');

// Stage 9 load check: loads each role's dashboard the way the browser does (all requests at once)
// and the main reports, and compares the time with the 3-second target.
const LIMIT_MS = 3000;
const ROUNDS = 4; // round 1 is the cold start; the rest are warm
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(todayInIst());
const yesterday = iso(new Date(todayInIst().getTime() - 86400000));

const PAGES = [
  {
    name: 'Head office dashboard',
    email: 'head1@demo.test',
    requests: [
      '/api/dashboard/summary',
      '/api/dashboard/breakdown?by=region',
      '/api/dashboard/breakdown?by=stage',
      '/api/dashboard/stage-durations',
      '/api/dashboard/ageing',
      '/api/applications?status=IN_PROGRESS&pageSize=10',
    ],
  },
  {
    name: 'Reports (head office)',
    email: 'head1@demo.test',
    requests: ['/api/reports/pending?pageSize=20', '/api/reports/overdue?pageSize=20', '/api/reports/compliance?pageSize=10'],
  },
  {
    name: 'Supervisor dashboard',
    email: 'supervisor1@demo.test',
    requests: [
      '/api/dashboard/summary',
      '/api/dashboard/breakdown?by=officer',
      '/api/dashboard/ageing',
      `/api/applications?status=IN_PROGRESS&dueTo=${yesterday}&pageSize=15`,
    ],
  },
  {
    name: 'Officer dashboard',
    email: 'officer1@demo.test',
    requests: [
      '/api/dashboard/summary',
      '/api/dashboard/ageing',
      `/api/applications?status=IN_PROGRESS&dueFrom=${today}&dueTo=${today}&pageSize=10`,
      `/api/applications?status=IN_PROGRESS&dueTo=${yesterday}&pageSize=10`,
      '/api/documents?expiringWithinDays=60&pageSize=5',
    ],
  },
  {
    name: 'Institution dashboard',
    email: 'institution1@demo.test',
    requests: [
      '/api/dashboard/summary',
      '/api/applications?pageSize=10',
      '/api/undertakings?status=PENDING&pageSize=5',
      '/api/undertakings?status=REJECTED&pageSize=5',
      '/api/documents?expiringWithinDays=60&pageSize=5',
    ],
  },
];

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function timed(agent, url) {
  const start = process.hrtime.bigint();
  const res = await agent.get(url);
  return { url, status: res.status, ms: ms(start) };
}

async function main() {
  console.log(`Applications in the database: ${await prisma.application.count()}`);
  const agents = new Map(); // one login per account
  const rows = [];
  let failed = false;

  for (const page of PAGES) {
    if (!agents.has(page.email)) {
      const agent = request.agent(app);
      const login = await agent.post('/api/auth/login').send({ email: page.email, password: 'Demo@1234' });
      if (login.status !== 200) throw new Error(`Login failed for ${page.email} (status ${login.status}; a 429 means wait a few minutes)`);
      agents.set(page.email, agent);
    }
    const agent = agents.get(page.email);
    const walls = [];
    let slowest = { url: '', ms: 0 };
    for (let round = 1; round <= ROUNDS; round += 1) {
      const start = process.hrtime.bigint();
      const results = await Promise.all(page.requests.map((url) => timed(agent, url)));
      walls.push(ms(start));
      for (const r of results) {
        if (r.status !== 200) {
          failed = true;
          console.error(`Status ${r.status} for ${r.url}`);
        }
        if (r.ms > slowest.ms) slowest = r;
      }
    }
    const worst = Math.max(...walls);
    if (worst >= LIMIT_MS) failed = true;
    rows.push({
      page: page.name,
      'first load ms': Math.round(walls[0]),
      'worst warm ms': Math.round(Math.max(...walls.slice(1))),
      'slowest request': `${slowest.url.replace('/api/', '')} (${Math.round(slowest.ms)} ms)`,
      result: worst < LIMIT_MS ? 'PASS' : 'FAIL',
    });
  }

  console.table(rows);
  console.log(failed ? `At least one page is over ${LIMIT_MS} ms or returned an error.` : `All pages load in under ${LIMIT_MS} ms.`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());