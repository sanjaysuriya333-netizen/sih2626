const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/dashboardService');

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  return r.data;
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');

const filterShape = {
  region: z.string().trim().min(1).max(100).optional(),
  stage: z.string().trim().min(1).max(100).optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
};
const orderOk = (v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo;
const orderMsg = { message: 'dueFrom must not be after dueTo', path: ['dueFrom'] };
const filterQuery = z.object(filterShape).refine(orderOk, orderMsg);
const breakdownQuery = z
  .object({ by: z.enum(['status', 'stage', 'region', 'institution', 'officer']), ...filterShape })
  .refine(orderOk, orderMsg);

// An empty value (an unused filter box) counts as "not set"
const clean = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));
const toDate = (s) => (s ? new Date(`${s}T00:00:00Z`) : undefined);
const filters = (q) => ({ region: q.region, stage: q.stage, dueFrom: toDate(q.dueFrom), dueTo: toDate(q.dueTo) });

const summary = asyncHandler(async (req, res) => {
  const q = parse(filterQuery, clean(req.query));
  res.json({ data: await svc.getSummary(req.user, filters(q)) });
});

const breakdown = asyncHandler(async (req, res) => {
  const q = parse(breakdownQuery, clean(req.query));
  res.json({ data: await svc.getBreakdown(req.user, q.by, filters(q)) });
});

const ageing = asyncHandler(async (req, res) => {
  const q = parse(filterQuery, clean(req.query));
  res.json({ data: await svc.getAgeing(req.user, filters(q)) });
});

const stageDurations = asyncHandler(async (req, res) => {
  const q = parse(filterQuery, clean(req.query));
  res.json({ data: await svc.getStageDurations(req.user, filters(q)) });
});

module.exports = { summary, breakdown, ageing, stageDurations };