const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const audit = require('../services/audit'); // called as audit.logAction so tests can spy on it
const svc = require('../services/reportService');
const { toCsv } = require('../utils/csvWrite');
const { todayInIst } = require('../jobs/dailyCheck');

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

const typeSchema = z.enum(['pending', 'overdue', 'compliance']);
const filterShape = {
  region: z.string().trim().min(1).max(100).optional(),
  stage: z.string().trim().min(1).max(100).optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
};
const orderOk = (v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo;
const orderMsg = { message: 'dueFrom must not be after dueTo', path: ['dueFrom'] };
const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    ...filterShape,
  })
  .refine(orderOk, orderMsg);
const exportQuery = z.object(filterShape).refine(orderOk, orderMsg);

// An empty value (an unused filter box) counts as "not set"
const clean = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));
const toDate = (s) => (s ? new Date(`${s}T00:00:00Z`) : undefined);
const toFilters = (q) => ({ region: q.region, stage: q.stage, dueFrom: toDate(q.dueFrom), dueTo: toDate(q.dueTo) });

const list = asyncHandler(async (req, res) => {
  const type = parse(typeSchema, req.params.type);
  const q = parse(listQuery, clean(req.query));
  const { columns, rows, total } = await svc.getReport(req.user, type, toFilters(q), { page: q.page, pageSize: q.pageSize });
  res.json({ data: rows, meta: { page: q.page, pageSize: q.pageSize, total, columns } });
});

// CSV download. ONE audit row per export; written before the file is sent, so a failed audit sends nothing.
const exportCsv = asyncHandler(async (req, res) => {
  const type = parse(typeSchema, req.params.type);
  const q = parse(exportQuery, clean(req.query));
  const { columns, rows } = await svc.getReport(req.user, type, toFilters(q), null);
  await audit.logAction({
    userId: req.user.id,
    action: 'REPORT_EXPORTED',
    entity: 'report',
    after: {
      report: type,
      filters: { region: q.region ?? null, stage: q.stage ?? null, dueFrom: q.dueFrom ?? null, dueTo: q.dueTo ?? null },
      rows: rows.length,
    },
  });
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="report-${type}-${todayInIst().toISOString().slice(0, 10)}.csv"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(toCsv(columns, rows));
});

module.exports = { list, exportCsv };