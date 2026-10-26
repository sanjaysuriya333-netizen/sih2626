import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

// Needs a seeded database: run npm run reset first
describe('seeded demo accounts', () => {
  const accounts = [
    ['officer1@demo.test', 'OFFICER'],
    ['supervisor1@demo.test', 'SUPERVISOR'],
    ['head1@demo.test', 'HEAD_OFFICE'],
    ['institution1@demo.test', 'INSTITUTION'],
  ];

  it.each(accounts)('%s exists with role %s and password Demo@1234', async (email, role) => {
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user.role).toBe(role);
    expect(await bcrypt.compare('Demo@1234', user.passwordHash)).toBe(true);
  });

  it('has 4 routes with stages', async () => {
    expect(await prisma.route.count()).toBe(4);
    expect(await prisma.routeStage.count()).toBe(21);
  });
});
