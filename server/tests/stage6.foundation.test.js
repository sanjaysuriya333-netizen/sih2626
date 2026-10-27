import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const prisma = require('../src/utils/prisma.js');
const { getProofsDir, proofFilePath } = require('../src/utils/uploadDir.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-uploads-'));
const oldDir = process.env.UPLOAD_DIR;

afterAll(async () => {
  process.env.UPLOAD_DIR = oldDir;
  fs.rmSync(tmp, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('Stage 6 seed data', () => {
  it('has one active EVC minimum-notice rule of 7 working days', async () => {
    const rules = await prisma.evcRule.findMany({ where: { active: true } });
    expect(rules).toHaveLength(1);
    expect(rules[0].minNoticeDays).toBe(7);
  });

  it('has EVC reminders at 7, 3 and 1 days before for both channels', async () => {
    const rules = await prisma.alertRule.findMany({ where: { kind: 'EVC', level: 'REMINDER_SENT' } });
    for (const channel of ['EMAIL', 'IN_APP']) {
      const leads = rules.filter((r) => r.channel === channel).map((r) => r.daysBefore).sort((a, b) => b - a);
      expect(leads).toEqual([7, 3, 1]);
    }
  });
});

describe('upload folder helpers', () => {
  it('creates an absolute proofs folder under UPLOAD_DIR', () => {
    process.env.UPLOAD_DIR = tmp;
    const dir = getProofsDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('accepts generated names and rejects path tricks', () => {
    process.env.UPLOAD_DIR = tmp;
    expect(proofFilePath('3f2a-11ee.pdf').startsWith(tmp)).toBe(true);
    expect(() => proofFilePath('../secret.pdf')).toThrow();
    expect(() => proofFilePath('a/b.pdf')).toThrow();
    expect(() => proofFilePath('evil.exe')).toThrow();
  });
});