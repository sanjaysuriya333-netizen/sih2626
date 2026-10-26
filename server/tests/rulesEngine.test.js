import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pickRoute, buildSchedule, nextStage } = require('../src/services/rulesEngine.js');
const { ROUTES, ROUTE_RULES } = require('../prisma/seed/data.js');

const iso = (d) => d.toISOString().slice(0, 10);
const errorCode = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

// Builds ctx the same way the database would, from the seed data
function makeCtx(holidays = []) {
  let stageId = 0;
  const routes = ROUTES.map((r, i) => ({
    id: i + 1,
    name: r.name,
    stages: r.stages.map(([stageName, maxDays, ownerRole], j) => ({
      id: ++stageId,
      orderNo: j + 1,
      stageName,
      maxDays,
      ownerRole,
    })),
  }));
  const idByName = Object.fromEntries(routes.map((r) => [r.name, r.id]));
  const rules = ROUTE_RULES.map((r) => ({
    priority: r.priority,
    routeId: idByName[r.route],
    institutionTypes: r.institutionTypes,
    newOrExisting: r.newOrExisting,
    programmeLevels: r.programmeLevels,
    active: true,
  }));
  return { routes, rules, holidays: new Set(holidays) };
}

const app = (over = {}) => ({
  institutionType: 'PRIVATE',
  newOrExisting: 'EXISTING',
  programmeLevel: 'UG',
  ...over,
});
const routeName = (ctx, id) => ctx.routes.find((r) => r.id === id).name;

describe('pickRoute', () => {
  it.each([
    ['NEW', 'PG', 'EVC + SAC/SHC'],
    ['NEW', 'UG', 'Scrutiny + EVC'],
    ['NEW', 'DIPLOMA', 'Scrutiny + EVC'],
    ['EXISTING', 'PG', 'Only EVC'],
    ['EXISTING', 'UG', 'Only scrutiny'],
    ['EXISTING', 'DIPLOMA', 'Only scrutiny'],
  ])('%s + %s -> %s', (newOrExisting, programmeLevel, expected) => {
    const ctx = makeCtx();
    expect(routeName(ctx, pickRoute(app({ newOrExisting, programmeLevel }), ctx))).toBe(expected);
  });

  it('institution type does not change the route (rules say "any")', () => {
    const ctx = makeCtx();
    for (const institutionType of ['GOVERNMENT', 'PRIVATE', 'AUTONOMOUS']) {
      expect(routeName(ctx, pickRoute(app({ institutionType }), ctx))).toBe('Only scrutiny');
    }
  });

  it('unknown programme level is a clear error', () => {
    expect(errorCode(() => pickRoute(app({ programmeLevel: 'PHD' }), makeCtx()))).toBe('UNKNOWN_ATTRIBUTE');
  });

  it('missing attribute is a clear error', () => {
    expect(errorCode(() => pickRoute(app({ newOrExisting: undefined }), makeCtx()))).toBe('UNKNOWN_ATTRIBUTE');
  });

  it('unknown institution type is a clear error', () => {
    expect(errorCode(() => pickRoute(app({ institutionType: 'TRUST' }), makeCtx()))).toBe('UNKNOWN_ATTRIBUTE');
  });

  it('no matching rule is an error, never a default route', () => {
    const ctx = makeCtx();
    ctx.rules = [];
    expect(errorCode(() => pickRoute(app(), ctx))).toBe('NO_ROUTE_MATCH');
  });

  it('an inactive rule is skipped', () => {
    const ctx = makeCtx();
    ctx.rules[0].active = false; // NEW + PG rule
    expect(errorCode(() => pickRoute(app({ newOrExisting: 'NEW', programmeLevel: 'PG' }), ctx))).toBe(
      'NO_ROUTE_MATCH',
    );
  });

  it('the lowest priority number wins when rules overlap', () => {
    const ctx = makeCtx();
    ctx.rules.push({
      priority: 0,
      routeId: ctx.routes[2].id, // Only EVC
      institutionTypes: [],
      newOrExisting: [],
      programmeLevels: [],
      active: true,
    });
    expect(routeName(ctx, pickRoute(app(), ctx))).toBe('Only EVC');
  });

  it('a fifth route works through data only', () => {
    const ctx = makeCtx();
    ctx.routes.push({
      id: 99,
      name: 'Fast track',
      stages: [{ id: 900, orderNo: 1, stageName: 'Single check', maxDays: 3, ownerRole: 'OFFICER' }],
    });
    ctx.rules.push({
      priority: 0,
      routeId: 99,
      institutionTypes: ['GOVERNMENT'],
      newOrExisting: [],
      programmeLevels: [],
      active: true,
    });
    expect(pickRoute(app({ institutionType: 'GOVERNMENT' }), ctx)).toBe(99);
    expect(routeName(ctx, pickRoute(app({ institutionType: 'PRIVATE' }), ctx))).toBe('Only scrutiny');
    const s = buildSchedule(app({ institutionType: 'GOVERNMENT' }), '2026-10-26', ctx);
    expect(iso(s.stages[0].dueDate)).toBe('2026-10-29');
  });
});

describe('buildSchedule', () => {
  it('dates every stage of Only scrutiny (Mon 2026-10-26 start)', () => {
    const s = buildSchedule(app(), '2026-10-26', makeCtx());
    expect(s.routeName).toBe('Only scrutiny');
    expect(s.stages.map((x) => iso(x.dueDate))).toEqual([
      '2026-10-28',
      '2026-11-11',
      '2026-11-20',
      '2026-11-27',
    ]);
  });

  it('Scrutiny + EVC has 6 chained stages with owners', () => {
    const s = buildSchedule(app({ newOrExisting: 'NEW' }), '2026-10-26', makeCtx());
    expect(s.routeName).toBe('Scrutiny + EVC');
    expect(s.stages).toHaveLength(6);
    expect(iso(s.stages[0].startDate)).toBe('2026-10-26');
    for (let i = 1; i < s.stages.length; i++) {
      expect(iso(s.stages[i].startDate)).toBe(iso(s.stages[i - 1].dueDate));
    }
    expect(s.stages[5].ownerRole).toBe('SUPERVISOR');
  });

  it('a weekend start counts from the next working day', () => {
    const s = buildSchedule(app(), '2026-10-24', makeCtx()); // Saturday
    expect(iso(s.stages[0].dueDate)).toBe('2026-10-27');
  });

  it('skips a holiday inside a stage', () => {
    const s = buildSchedule(app(), '2026-10-26', makeCtx(['2026-10-28']));
    expect(iso(s.stages[0].dueDate)).toBe('2026-10-29');
  });

  it('holiday on the year boundary', () => {
    const plain = buildSchedule(app(), '2026-12-30', makeCtx());
    const withHoliday = buildSchedule(app(), '2026-12-30', makeCtx(['2027-01-01']));
    expect(iso(plain.stages[0].dueDate)).toBe('2027-01-01');
    expect(iso(withHoliday.stages[0].dueDate)).toBe('2027-01-04');
  });

  it('handles the leap day 29 Feb 2028', () => {
    const s = buildSchedule(app(), '2028-02-25', makeCtx()); // Friday
    expect(iso(s.stages[0].dueDate)).toBe('2028-02-29');
  });

  it('a zero-day stage is due the day it starts', () => {
    const ctx = makeCtx();
    ctx.routes[0].stages[1].maxDays = 0; // Only scrutiny, stage 2
    const s = buildSchedule(app(), '2026-10-26', ctx);
    expect(iso(s.stages[1].dueDate)).toBe('2026-10-28');
    expect(iso(s.stages[2].dueDate)).toBe('2026-11-06');
  });

  it('returns stages in order_no order even if loaded out of order', () => {
    const ctx = makeCtx();
    ctx.routes[0].stages.reverse();
    const s = buildSchedule(app(), '2026-10-26', ctx);
    expect(s.stages.map((x) => x.orderNo)).toEqual([1, 2, 3, 4]);
  });

  it('a route with no stages is an error', () => {
    const ctx = makeCtx();
    ctx.routes[0].stages = [];
    expect(errorCode(() => buildSchedule(app(), '2026-10-26', ctx))).toBe('ROUTE_HAS_NO_STAGES');
  });

  it('bad attributes fail before any dates are built', () => {
    expect(errorCode(() => buildSchedule(app({ programmeLevel: 'PHD' }), '2026-10-26', makeCtx()))).toBe(
      'UNKNOWN_ATTRIBUTE',
    );
  });
});

describe('nextStage', () => {
  const ctx = makeCtx();
  const route = ctx.routes[0];

  it('returns the following stage mid-route', () => {
    const next = nextStage({ routeId: route.id, currentStageId: route.stages[0].id }, ctx);
    expect(next.id).toBe(route.stages[1].id);
  });

  it('returns null after the last stage', () => {
    expect(nextStage({ routeId: route.id, currentStageId: route.stages[3].id }, ctx)).toBeNull();
  });

  it('no current stage returns the first stage', () => {
    expect(nextStage({ routeId: route.id, currentStageId: null }, ctx).id).toBe(route.stages[0].id);
  });

  it('a stage from another route is an error', () => {
    const other = ctx.routes[1].stages[0].id;
    expect(errorCode(() => nextStage({ routeId: route.id, currentStageId: other }, ctx))).toBe(
      'STAGE_NOT_IN_ROUTE',
    );
  });

  it('an application without a route is an error', () => {
    expect(errorCode(() => nextStage({ routeId: null, currentStageId: null }, ctx))).toBe('NO_ROUTE');
  });
});