import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const prisma = require('../src/utils/prisma.js');
const { runPortalSync } = require('../src/services/portalSyncMock.js');

const startedAt = new Date();
const created = [];
const HEADER = 'institutionId,newOrExisting,programmeLevel,submittedOn,assignedOfficerEmail';

async function agentFor(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Demo@1234' });
  return agent;
}
const upload = (agent, content, { filename = 'import.csv', contentType = 'text/csv' } = {}) =>
  agent.post('/api/applications/import').attach('file', Buffer.from(content), { filename, contentType });
const track = (res) => {
  if (res.status === 200) created.push(...res.body.data.created.map((c) => c.id));
  return res;
};
const hasError = (d, row, field) => d.errors.some((e) => e.row === row && e.field === field);

let officer, sup, head, inst;
let officer1, teamOfficer, outsideOfficer;

beforeAll(async () => {
  [officer, sup, head, inst] = await Promise.all([
    agentFor('officer1@demo.test'),
    agentFor('supervisor1@demo.test'),
    agentFor('head1@demo.test'),
    agentFor('institution1@demo.test'),
  ]);
  officer1 = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  const sup1 = await prisma.user.findUnique({ where: { email: 'supervisor1@demo.test' } });
  teamOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: sup1.id } });
  outsideOfficer = await prisma.user.findFirst({ where: { role: 'OFFICER', supervisorId: { not: sup1.id } } });
});

afterAll(async () => {
  // test cleanup only: the app itself never deletes rows
  await prisma.obligation.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.stageHistory.deleteMany({ where: { applicationId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'application', entityId: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { action: 'APPLICATIONS_IMPORTED', at: { gte: startedAt } } });
  await prisma.application.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('POST /api/applications/import (rows)', () => {
  it('an officer imports valid rows for themselves', async () => {
    const res = track(await upload(officer, `${HEADER}\n1,NEW,UG,2026-10-26,\n2,EXISTING,PG,,${officer1.email}\n`));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, imported: 2, failed: 0, errors: [] });
    expect(res.body.data.created.map((c) => c.row)).toEqual([2, 3]);
    const files = await prisma.application.findMany({ where: { id: { in: res.body.data.created.map((c) => c.id) } } });
    expect(files.every((f) => f.assignedOfficerId === officer1.id)).toBe(true);
  });

  it('accepts lower-case values and extra columns', async () => {
    const res = track(await upload(officer, 'institutionId,newOrExisting,programmeLevel,notes\n1,new,ug,hello\n'));
    expect(res.body.data).toMatchObject({ imported: 1, failed: 0 });
  });

  it('reports row number, field and message, and still imports the valid rows', async () => {
    const csv = [
      HEADER,
      '1,NEW,UG,2026-10-26,', // row 2: fine
      'x,NEW,UG,,', // row 3: bad institutionId
      '1,MAYBE,PHD,,', // row 4: two bad fields
      '999,NEW,UG,,', // row 5: institution not found
      '1,NEW,UG,2026-02-30,', // row 6: impossible date
    ].join('\n');
    const res = track(await upload(officer, csv));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ total: 5, imported: 1, failed: 4 });
    expect(d.created.map((c) => c.row)).toEqual([2]);
    expect(hasError(d, 3, 'institutionId')).toBe(true);
    expect(hasError(d, 4, 'newOrExisting')).toBe(true);
    expect(hasError(d, 4, 'programmeLevel')).toBe(true);
    expect(hasError(d, 5, 'institutionId')).toBe(true);
    expect(hasError(d, 6, 'submittedOn')).toBe(true);
    expect(d.errors.every((e) => e.message)).toBe(true);
  });

  it("an officer cannot import files for another officer", async () => {
    const res = track(await upload(officer, `${HEADER}\n1,NEW,UG,,${outsideOfficer.email}\n`));
    expect(res.body.data).toMatchObject({ imported: 0, failed: 1 });
    expect(hasError(res.body.data, 2, 'assignedOfficerEmail')).toBe(true);
  });

  it('a supervisor must name an officer from the own team', async () => {
    const csv = [
      HEADER,
      '1,NEW,UG,,', // row 2: officer missing
      `1,NEW,UG,,${teamOfficer.email}`, // row 3: ok
      `1,NEW,UG,,${outsideOfficer.email}`, // row 4: other team
      '1,NEW,UG,,nobody@demo.test', // row 5: unknown
    ].join('\n');
    const res = track(await upload(sup, csv));
    const d = res.body.data;
    expect(d).toMatchObject({ imported: 1, failed: 3 });
    expect(d.created.map((c) => c.row)).toEqual([3]);
    for (const row of [2, 4, 5]) expect(hasError(d, row, 'assignedOfficerEmail')).toBe(true);
    const file = await prisma.application.findUnique({ where: { id: d.created[0].id } });
    expect(file.assignedOfficerId).toBe(teamOfficer.id);
  });

  it('head office can assign any officer', async () => {
    const res = track(await upload(head, `${HEADER}\n1,NEW,UG,,${outsideOfficer.email}\n`));
    expect(res.body.data).toMatchObject({ imported: 1, failed: 0 });
    const file = await prisma.application.findUnique({ where: { id: res.body.data.created[0].id } });
    expect(file.assignedOfficerId).toBe(outsideOfficer.id);
  });

  it('writes one summary audit row plus one row per created file', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'APPLICATIONS_IMPORTED' } });
    const res = track(await upload(officer, `${HEADER}\n1,NEW,UG,,\n`));
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATIONS_IMPORTED' } })).toBe(before + 1);
    expect(
      await prisma.auditLog.count({ where: { action: 'APPLICATION_CREATED', entityId: res.body.data.created[0].id } }),
    ).toBe(1);
  });
});

describe('POST /api/applications/import (access and file checks)', () => {
  it('an institution gets 403', async () => {
    expect((await upload(inst, `${HEADER}\n1,NEW,UG,,\n`)).status).toBe(403);
  });

  it('no login gives 401', async () => {
    const res = await request(app)
      .post('/api/applications/import')
      .attach('file', Buffer.from(`${HEADER}\n`), { filename: 'a.csv', contentType: 'text/csv' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong file type', async () => {
    const res = await upload(officer, `${HEADER}\n1,NEW,UG,,\n`, { filename: 'import.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file over 2 MB', async () => {
    const res = await upload(officer, Buffer.alloc(2 * 1024 * 1024 + 100, 'a'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a binary file named .csv', async () => {
    const res = await upload(officer, Buffer.from([0x50, 0x4b, 0x03, 0x00, 0x04]), { filename: 'data.csv' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects a request without a file', async () => {
    const res = await officer.post('/api/applications/import');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('rejects a header-only file', async () => {
    const res = await upload(officer, `${HEADER}\n`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_FILE');
  });

  it('rejects a file with a missing required column', async () => {
    const res = await upload(officer, 'institutionId,newOrExisting\n1,NEW\n');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_COLUMNS');
    expect(res.body.error.message).toContain('programmeLevel');
  });

  it('rejects a file with more than 200 rows and imports nothing', async () => {
    const before = await prisma.application.count();
    const rows = Array.from({ length: 201 }, () => '1,NEW,UG,,');
    const res = await upload(officer, [HEADER, ...rows].join('\n'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_ROWS');
    expect(await prisma.application.count()).toBe(before);
  });
});

describe('mock portal sync', () => {
  it('imports the sample feed through the same importer', async () => {
    const headRow = await prisma.user.findUnique({ where: { email: 'head1@demo.test' } });
    const user = {
      id: headRow.id,
      role: headRow.role,
      region: headRow.region,
      institutionId: headRow.institutionId,
      supervisorId: headRow.supervisorId,
    };
    const result = await runPortalSync(user);
    created.push(...result.created.map((c) => c.id));
    expect(result).toMatchObject({ total: 4, imported: 4, failed: 0 });
    const log = await prisma.auditLog.findFirst({
      where: { action: 'APPLICATIONS_IMPORTED', userId: headRow.id, at: { gte: startedAt } },
      orderBy: { id: 'desc' },
    });
    expect(log.afterJson.source).toBe('portal-sync-mock');
  });
});