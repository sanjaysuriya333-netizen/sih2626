// Pure alert-ladder logic (no database). The daily job uses it.
const { startOfUtcDay, workingDaysBetween } = require('./workingDays');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d) => startOfUtcDay(d).toISOString().slice(0, 10);

// Kinds counted in calendar days (a document expires on a calendar date).
// Every other kind is counted in working days.
const CALENDAR_KINDS = new Set(['DOCUMENT']);

// Rules of ONE kind -> ladder steps. Steps are numbered 1..n by days_before, largest first.
// Rules with the same days_before (one per channel/recipient) share one step.
function buildLadder(rules) {
  const byDays = new Map();
  for (const rule of rules) {
    if (rule.active === false) continue;
    if (!byDays.has(rule.daysBefore)) byDays.set(rule.daysBefore, []);
    byDays.get(rule.daysBefore).push(rule);
  }
  return [...byDays.keys()]
    .sort((a, b) => b - a)
    .map((daysBefore, i) => {
      const group = byDays.get(daysBefore);
      return { step: i + 1, daysBefore, level: group[0].level, rules: group };
    });
}

// All active rules -> { STAGE: [steps], EVC: [steps], ... }
function buildLadders(rules) {
  const kinds = [...new Set(rules.map((r) => r.kind))];
  return Object.fromEntries(kinds.map((k) => [k, buildLadder(rules.filter((r) => r.kind === k))]));
}

// Positive = days left, 0 = due on asOf, negative = days past due
function computeDaysToDue(kind, dueDate, asOf, holidays = new Set()) {
  if (CALENDAR_KINDS.has(kind)) {
    return Math.round((startOfUtcDay(dueDate).getTime() - startOfUtcDay(asOf).getTime()) / DAY_MS);
  }
  const n = workingDaysBetween(asOf, dueDate, holidays);
  return n === 0 ? 0 : n; // turns -0 into 0
}

// The step to fire now, or null. Only the LATEST applicable step is returned, and only if
// it is higher than the step already fired (this is what makes the job idempotent).
function pickTransition(ladder, daysToDue, lastAlertLevel) {
  let target = null;
  for (const s of ladder) {
    if (s.daysBefore >= daysToDue) target = s; // steps are sorted by days_before, largest first
  }
  return target && target.step > lastAlertLevel ? target : null;
}

// Notification text for each ladder level (this is the "transition table" of the handoff)
function alertMessage({ kind, level, label, dueDate, daysToDue }) {
  const date = isoDay(dueDate);
  const isDoc = kind === 'DOCUMENT';
  const unit = isDoc ? 'day' : 'working day';
  const n = Math.abs(daysToDue);
  const span = `${n} ${unit}${n === 1 ? '' : 's'}`;
  const verb = isDoc ? 'expires' : 'is due';
  const past = isDoc ? 'expired' : 'was due';

  switch (level) {
    case 'REMINDER_SENT':
      return { subject: `Reminder: ${label}`, body: `${label} ${verb} on ${date} (in ${span}).` };
    case 'DUE_TODAY':
      return { subject: `Due today: ${label}`, body: `${label} ${verb} on ${date}.` };
    case 'OVERDUE':
      return { subject: `Overdue: ${label}`, body: `${label} ${past} on ${date} and is now ${span} overdue.` };
    case 'ESCALATED':
      return {
        subject: `Escalated: ${label}`,
        body: `${label} ${past} on ${date} and is ${span} overdue. It has been escalated to you.`,
      };
    case 'REPORTED':
      return {
        subject: `Reported: ${label}`,
        body: `${label} ${past} on ${date} and is ${span} overdue. It is being reported to head office.`,
      };
    default:
      return { subject: label, body: `${label}: ${level}` };
  }
}

module.exports = { CALENDAR_KINDS, buildLadder, buildLadders, computeDaysToDue, pickTransition, alertMessage };