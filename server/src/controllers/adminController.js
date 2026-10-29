const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { runDailyCheckAudited } = require('../jobs/dailyCheck');

const query = z.object({
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'Not a real date')
    .optional(),
});

// Head office only. Runs the daily check now, for today (IST) or for a simulated date.
const runDailyCheck = asyncHandler(async (req, res) => {
  const r = query.safeParse(req.query);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  const result = await runDailyCheckAudited({
    asOf: r.data.asOf ? new Date(`${r.data.asOf}T00:00:00Z`) : undefined,
    userId: req.user.id,
  });

  const byKind = {};
  const byLevel = {};
  for (const t of result.transitions) {
    byKind[t.kind] = (byKind[t.kind] || 0) + 1;
    byLevel[t.to] = (byLevel[t.to] || 0) + 1;
  }
  res.json({
    data: {
      asOf: result.asOf,
      checked: result.checked,
      fired: result.fired,
      skipped: result.skipped,
      failed: result.failed,
      byKind,
      byLevel,
      transitions: result.transitions.slice(0, 100),
      failures: result.failures.slice(0, 20),
    },
  });
});

module.exports = { runDailyCheck };