import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv/config');
const prisma = require('../src/utils/prisma.js');

afterAll(() => prisma.$disconnect());

describe('seeded EVC entry flags', () => {
  it('flags "EVC scheduling" in the three routes that have EVC, and nothing else', async () => {
    const flagged = await prisma.routeStage.findMany({ where: { isEvcEntry: true }, include: { route: true } });
    expect(flagged.map((s) => s.route.name).sort()).toEqual(['EVC + SAC/SHC', 'Only EVC', 'Scrutiny + EVC']);
    expect(flagged.every((s) => s.stageName === 'EVC scheduling')).toBe(true);
  });
});