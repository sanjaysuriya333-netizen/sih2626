const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const evcService = require('../services/evcService');

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  return r.data;
}

// YYYY-MM-DD and a real calendar date
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');
const toDate = (s) => new Date(`${s}T00:00:00Z`);

const idSchema = z.coerce.number().int().positive();
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
};
const queueQuery = z.object(paging);
const listQuery = z.object({
  ...paging,
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']).optional(),
});
const scheduleBody = z.object({ plannedDate: dateString });
const completeBody = z.object({
  actualDate: dateString.optional(),
  committeeNotes: z.string().trim().min(1, 'Committee notes are required').max(2000),
});

const queue = asyncHandler(async (req, res) => {
  const q = parse(queueQuery, req.query);
  const { data, total } = await evcService.listQueue(req.user, q);
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total } });
});

const list = asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  const { data, total } = await evcService.listVisits(req.user, {
    page: q.page,
    pageSize: q.pageSize,
    status: q.status,
    from: q.from ? toDate(q.from) : undefined,
    to: q.to ? toDate(q.to) : undefined,
  });
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total } });
});

const schedule = asyncHandler(async (req, res) => {
  const applicationId = parse(idSchema, req.params.applicationId);
  const body = parse(scheduleBody, req.body);
  const data = await evcService.scheduleVisit(req.user, applicationId, toDate(body.plannedDate));
  res.status(201).json({ data });
});

const complete = asyncHandler(async (req, res) => {
  const visitId = parse(idSchema, req.params.visitId);
  const body = parse(completeBody, req.body);
  const data = await evcService.completeVisit(req.user, visitId, {
    actualDate: body.actualDate ? toDate(body.actualDate) : undefined,
    committeeNotes: body.committeeNotes,
  });
  res.json({ data });
});

module.exports = { queue, list, schedule, complete };