import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isWorkingDay, addWorkingDays, workingDaysBetween } = require('../src/services/workingDays.js');

const iso = (d) => d.toISOString().slice(0, 10);
// Reference dates: 2026-10-23 is a Friday, 2026-10-26 a Monday
const none = new Set();

describe('isWorkingDay', () => {
  it('Monday to Friday are working days', () => {
    expect(isWorkingDay('2026-10-23', none)).toBe(true); // Fri
    expect(isWorkingDay('2026-10-26', none)).toBe(true); // Mon
  });
  it('Saturday and Sunday are not', () => {
    expect(isWorkingDay('2026-10-24', none)).toBe(false);
    expect(isWorkingDay('2026-10-25', none)).toBe(false);
  });
  it('a holiday is not a working day', () => {
    expect(isWorkingDay('2026-10-28', new Set(['2026-10-28']))).toBe(false);
  });
});

describe('addWorkingDays', () => {
  it('adds within a week', () => {
    expect(iso(addWorkingDays('2026-10-26', 3, none))).toBe('2026-10-29');
  });
  it('skips the weekend', () => {
    expect(iso(addWorkingDays('2026-10-23', 1, none))).toBe('2026-10-26');
  });
  it('a start on a Saturday counts from Monday', () => {
    expect(iso(addWorkingDays('2026-10-24', 1, none))).toBe('2026-10-26');
  });
  it('skips a holiday', () => {
    const h = new Set(['2026-10-28']);
    expect(iso(addWorkingDays('2026-10-26', 2, h))).toBe('2026-10-29');
  });
  it('holiday on the year boundary', () => {
    const h = new Set(['2027-01-01']);
    expect(iso(addWorkingDays('2026-12-31', 1, h))).toBe('2027-01-04');
  });
  it('handles the leap day 29 Feb 2028', () => {
    expect(iso(addWorkingDays('2028-02-28', 1, none))).toBe('2028-02-29');
    expect(iso(addWorkingDays('2028-02-29', 1, none))).toBe('2028-03-01');
  });
  it('zero days returns the same day', () => {
    expect(iso(addWorkingDays('2026-10-24', 0, none))).toBe('2026-10-24');
  });
  it('ignores the time of day', () => {
    expect(iso(addWorkingDays('2026-10-26T18:30:00Z', 1, none))).toBe('2026-10-27');
  });
  it('rejects negative or fractional n', () => {
    expect(() => addWorkingDays('2026-10-26', -1, none)).toThrow(RangeError);
    expect(() => addWorkingDays('2026-10-26', 1.5, none)).toThrow(RangeError);
  });
  it('rejects an invalid date', () => {
    expect(() => addWorkingDays('not a date', 1, none)).toThrow(TypeError);
  });
});

describe('workingDaysBetween', () => {
  it('same day is 0', () => {
    expect(workingDaysBetween('2026-10-26', '2026-10-26', none)).toBe(0);
  });
  it('Friday to Monday is 1', () => {
    expect(workingDaysBetween('2026-10-23', '2026-10-26', none)).toBe(1);
  });
  it('is negative when b is before a', () => {
    expect(workingDaysBetween('2026-10-26', '2026-10-23', none)).toBe(-1);
  });
  it('one full week is 5, or 4 with a holiday', () => {
    expect(workingDaysBetween('2026-10-23', '2026-10-30', none)).toBe(5);
    expect(workingDaysBetween('2026-10-23', '2026-10-30', new Set(['2026-10-28']))).toBe(4);
  });
  it('is the inverse of addWorkingDays', () => {
    const h = new Set(['2026-10-28']);
    const due = addWorkingDays('2026-10-26', 7, h);
    expect(workingDaysBetween('2026-10-26', due, h)).toBe(7);
  });
});