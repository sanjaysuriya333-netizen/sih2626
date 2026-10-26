// Working-day maths. Everything is UTC; holidays come in as a Set of 'YYYY-MM-DD'.
const DAY_MS = 24 * 60 * 60 * 1000;

// Any date -> that day at 00:00 UTC
function startOfUtcDay(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new TypeError('Invalid date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const dateKey = (input) => startOfUtcDay(input).toISOString().slice(0, 10);

// Loads the holidays table into a Set of 'YYYY-MM-DD' (pass in the Prisma client)
async function loadHolidays(prisma) {
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  return new Set(rows.map((r) => dateKey(r.date)));
}

// Monday to Friday, and not a holiday
function isWorkingDay(date, holidays = new Set()) {
  const weekday = startOfUtcDay(date).getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(dateKey(date));
}

// n working days AFTER date (the start day is not counted). n = 0 returns the same day.
function addWorkingDays(date, n, holidays = new Set()) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a whole number, 0 or more');
  let current = startOfUtcDay(date);
  let remaining = n;
  while (remaining > 0) {
    current = new Date(current.getTime() + DAY_MS);
    if (isWorkingDay(current, holidays)) remaining -= 1;
  }
  return current;
}

// Working days after a, up to and including b. Negative if b is before a.
function workingDaysBetween(a, b, holidays = new Set()) {
  const start = startOfUtcDay(a);
  const end = startOfUtcDay(b);
  if (end < start) return -workingDaysBetween(end, start, holidays);
  let count = 0;
  for (let t = start.getTime() + DAY_MS; t <= end.getTime(); t += DAY_MS) {
    if (isWorkingDay(new Date(t), holidays)) count += 1;
  }
  return count;
}

module.exports = {
  startOfUtcDay,
  dateKey,
  loadHolidays,
  isWorkingDay,
  addWorkingDays,
  workingDaysBetween,
};