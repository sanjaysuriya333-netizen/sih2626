import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv/config');
const prisma = require('../src/utils/prisma.js');
const { loadRulesContext } = require('../src/services/rulesData.js');
const { buildSchedule } = require('../src/services/rulesEngine.js');
const { persistSchedule } = require('../src/services/scheduleService.js');

afterAll(() => prisma.$disconnect());

// Run fn inside a transaction, then always roll it back
class Rollback extends Error {}
async function inRollback(fn) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const iso = (d) => d.toISOString().slice(0, 10);

// Creates a throwaway application for officer1 and builds its schedule
async function setup(tx, { newOrExisting, programmeLevel }) {
  const officer = await prisma.user.findUnique({ where: { email: 'officer1@demo.test' } });
  const institution = await prisma.institution.findFirst();
  const ctx = await loadRulesContext(prisma);
  const schedule = buildSchedule(
    { institutionType: institution.institutionType, newOrExisting, programmeLevel },
    '2026-10-26',
    ctx,
  );
  const application = await tx.application.create({
    data: {
      appCode: `TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      institutionId: institution.id,
      routeId: schedule.routeId,
      assignedOfficerId: officer.id,
      newOrExisting,
      programmeLevel,
      submittedOn: new Date('2026-10-26T00:00:00Z'),
    },
  });
  return { officer, application, schedule };
}

const stageObligations = (tx, applicationId) =>
  tx.obligation.findMany({ where: { applicationId, kind: 'STAGE' }, orderBy: { dueDate: 'asc' } });

describe('persistSchedule', () => {
  it('creates one OPEN STAGE obligation per stage with the right dates and stage ids', async () => {
    await inRollback(async (tx) => {
      const { application, schedule } = await setup(tx, { newOrExisting: 'EXISTING', programmeLevel: 'UG' });
      const count = await persistSchedule(tx, application, schedule);
      expect(count).toBe(4);

      const rows = await stageObligations(tx, application.id);
      expect(rows.map((r) => iso(r.dueDate))).toEqual(['2026-10-28', '2026-11-11', '2026-11-20', '2026-11-27']);
      expect(rows.map((r) => r.refId)).toEqual(schedule.stages.map((s) => s.stageId));
      expect(rows.every((r) => r.state === 'OPEN' && r.closedOn === null)).toBe(true);
    });
  });

  it('assigns owners by role: officer, officer (institution stage), supervisor', async () => {
    await inRollback(async (tx) => {
      const { officer, application, schedule } = await setup(tx, {
        newOrExisting: 'EXISTING',
        programmeLevel: 'UG',
      });
      await persistSchedule(tx, application, schedule);
      const rows = await stageObligations(tx, application.id);
      // Only scrutiny: OFFICER, OFFICER, INSTITUTION, SUPERVISOR
      expect(rows.map((r) => r.ownerId)).toEqual([officer.id, officer.id, officer.id, officer.supervisorId]);
    });
  });

  it('gives head-office stages to a head-office user', async () => {
    await inRollback(async (tx) => {
      const { application, schedule } = await setup(tx, { newOrExisting: 'NEW', programmeLevel: 'PG' });
      await persistSchedule(tx, application, schedule);
      const rows = await stageObligations(tx, application.id);
      const lastTwo = rows.slice(-2);
      const owners = await tx.user.findMany({ where: { id: { in: lastTwo.map((r) => r.ownerId) } } });
      expect(owners.every((u) => u.role === 'HEAD_OFFICE')).toBe(true);
    });
  });

  it('falls back to head office when the officer has no supervisor', async () => {
    await inRollback(async (tx) => {
      const { officer, application, schedule } = await setup(tx, {
        newOrExisting: 'EXISTING',
        programmeLevel: 'UG',
      });
      await tx.user.update({ where: { id: officer.id }, data: { supervisorId: null } });
      await persistSchedule(tx, application, schedule);
      const rows = await stageObligations(tx, application.id);
      const approval = await tx.user.findUnique({ where: { id: rows[3].ownerId } });
      expect(approval.role).toBe('HEAD_OFFICE');
    });
  });

  it('refuses to create the schedule twice (409)', async () => {
    await inRollback(async (tx) => {
      const { application, schedule } = await setup(tx, { newOrExisting: 'EXISTING', programmeLevel: 'UG' });
      await persistSchedule(tx, application, schedule);
      await expect(persistSchedule(tx, application, schedule)).rejects.toMatchObject({
        status: 409,
        code: 'SCHEDULE_EXISTS',
      });
      expect(await stageObligations(tx, application.id)).toHaveLength(4);
    });
  });

  it('rejects an unknown officer', async () => {
    await inRollback(async (tx) => {
      const { application, schedule } = await setup(tx, { newOrExisting: 'EXISTING', programmeLevel: 'UG' });
      await expect(
        persistSchedule(tx, { id: application.id, assignedOfficerId: 999999 }, schedule),
      ).rejects.toMatchObject({ code: 'OFFICER_NOT_FOUND' });
    });
  });
});