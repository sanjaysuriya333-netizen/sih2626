import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv/config');
const prisma = require('../src/utils/prisma.js');

afterAll(() => prisma.$disconnect());

describe('seeded route_rules', () => {
  it('has the 4 rules in priority order pointing at the right routes', async () => {
    const rules = await prisma.routeRule.findMany({ orderBy: { priority: 'asc' }, include: { route: true } });
    expect(rules.map((r) => [r.priority, r.route.name])).toEqual([
      [1, 'EVC + SAC/SHC'],
      [2, 'Scrutiny + EVC'],
      [3, 'Only EVC'],
      [4, 'Only scrutiny'],
    ]);
  });

  it('stores "any" as an empty array and lists as arrays', async () => {
    const rules = await prisma.routeRule.findMany({ orderBy: { priority: 'asc' } });
    expect(rules[0].institutionTypes).toEqual([]);
    expect([...rules[1].programmeLevels].sort()).toEqual(['DIPLOMA', 'UG']);
    expect(rules[2].newOrExisting).toEqual(['EXISTING']);
  });
});