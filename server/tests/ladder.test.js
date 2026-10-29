import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAlertRules } = require('../prisma/seed/data.js');
const { buildLadder, computeDaysToDue, pickTransition, alertMessage } = require('../src/services/ladder.js');

const rulesFor = (kind) => buildAlertRules().filter((r) => r.kind === kind).map((r) => ({ ...r, active: true }));
const d = (iso) => new Date(`${iso}T00:00:00Z`);

describe('buildLadder', () => {
  it('numbers the STAGE steps 1..5 and groups the channels of one step', () => {
    const ladder = buildLadder(rulesFor('STAGE'));
    expect(ladder.map((s) => s.daysBefore)).toEqual([2, 0, -1, -3, -7]);
    expect(ladder.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    expect(ladder.map((s) => s.level)).toEqual(['REMINDER_SENT', 'DUE_TODAY', 'OVERDUE', 'ESCALATED', 'REPORTED']);
    expect(ladder.every((s) => s.rules.length === 2)).toBe(true); // EMAIL + IN_APP
  });

  it('gives the three EVC reminders three different steps', () => {
    const ladder = buildLadder(rulesFor('EVC'));
    expect(ladder.map((s) => s.daysBefore)).toEqual([7, 3, 1, 0, -1, -3, -7]);
    expect(ladder.slice(0, 3).map((s) => s.level)).toEqual(['REMINDER_SENT', 'REMINDER_SENT', 'REMINDER_SENT']);
    expect(ladder.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('ignores inactive rules', () => {
    const rules = rulesFor('STAGE').map((r) => (r.daysBefore === 2 ? { ...r, active: false } : r));
    expect(buildLadder(rules).map((s) => s.daysBefore)).toEqual([0, -1, -3, -7]);
  });
});

describe('pickTransition', () => {
  const ladder = buildLadder(rulesFor('STAGE'));
  const stepOf = (dtd, last) => pickTransition(ladder, dtd, last)?.step ?? null;

  it('does nothing before the first reminder', () => expect(stepOf(5, 0)).toBeNull());
  it('fires the first reminder', () => expect(stepOf(2, 0)).toBe(1));
  it('does not repeat a step already fired', () => {
    expect(stepOf(2, 1)).toBeNull();
    expect(stepOf(1, 1)).toBeNull();
    expect(stepOf(-2, 3)).toBeNull();
  });
  it('fires the next step', () => {
    expect(stepOf(0, 1)).toBe(2);
    expect(stepOf(-3, 3)).toBe(4);
  });
  it('jumps to the latest applicable step', () => expect(stepOf(-10, 0)).toBe(5));
  it('returns null for an empty ladder', () => expect(pickTransition([], -5, 0)).toBeNull());
});

describe('computeDaysToDue', () => {
  it('counts working days for STAGE across a holiday and a weekend', () => {
    // Thu 24 Dec 2026 -> Mon 28 Dec 2026: Fri 25 is a holiday, 26 and 27 are the weekend
    expect(computeDaysToDue('STAGE', d('2026-12-28'), d('2026-12-24'), new Set(['2026-12-25']))).toBe(1);
  });
  it('is negative after the due date', () => {
    expect(computeDaysToDue('STAGE', d('2027-03-10'), d('2027-03-15'))).toBe(-3);
  });
  it('is 0 for an item due on Friday when checked on Saturday (known weekend behaviour)', () => {
    expect(computeDaysToDue('STAGE', d('2027-03-12'), d('2027-03-13'))).toBe(0);
  });
  it('counts calendar days for DOCUMENT', () => {
    expect(computeDaysToDue('DOCUMENT', d('2027-06-10'), d('2027-04-11'))).toBe(60);
    expect(computeDaysToDue('DOCUMENT', d('2027-06-10'), d('2027-06-11'))).toBe(-1);
  });
});

describe('alertMessage', () => {
  const base = { kind: 'STAGE', label: 'Stage "Document scrutiny" of APP-1', dueDate: d('2027-03-10') };
  it('writes a text for every ladder level', () => {
    expect(alertMessage({ ...base, level: 'REMINDER_SENT', daysToDue: 2 }).body).toContain('in 2 working days');
    expect(alertMessage({ ...base, level: 'DUE_TODAY', daysToDue: 0 }).subject).toMatch(/^Due today/);
    expect(alertMessage({ ...base, level: 'OVERDUE', daysToDue: -1 }).body).toContain('1 working day overdue');
    expect(alertMessage({ ...base, level: 'ESCALATED', daysToDue: -3 }).body).toContain('escalated');
    expect(alertMessage({ ...base, level: 'REPORTED', daysToDue: -7 }).body).toContain('head office');
  });
  it('uses "expires" and calendar days for documents', () => {
    const m = alertMessage({ ...base, kind: 'DOCUMENT', level: 'REMINDER_SENT', daysToDue: 60 });
    expect(m.body).toContain('expires on 2027-03-10');
    expect(m.body).toContain('60 days');
  });
});