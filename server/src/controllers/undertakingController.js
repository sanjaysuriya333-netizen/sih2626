const fs = require('node:fs');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/undertakingService');

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
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const idSchema = z.coerce.number().int().positive();

const recordBody = z.object({
  description: z.string().trim().min(3, 'Describe the promise').max(1000),
  dueDate: dateString,
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED']).optional(),
  applicationId: idSchema.optional(),
});
const verifyBody = z
  .object({
    status: z.enum(['ACCEPTED', 'REJECTED']),
    remarks: z.string().trim().min(1).max(1000).optional(),
    newDueDate: dateString.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'REJECTED') {
      if (!v.remarks) ctx.addIssue({ code: 'custom', path: ['remarks'], message: 'Remarks are required when rejecting' });
      if (!v.newDueDate) ctx.addIssue({ code: 'custom', path: ['newDueDate'], message: 'A new due date is required when rejecting' });
    } else if (v.newDueDate) {
      ctx.addIssue({ code: 'custom', path: ['newDueDate'], message: 'newDueDate is only used when rejecting' });
    }
  });

const record = asyncHandler(async (req, res) => {
  const applicationId = parse(idSchema, req.params.id);
  const body = parse(recordBody, req.body);
  const data = await svc.recordUndertaking(req.user, applicationId, {
    description: body.description,
    dueDate: toDate(body.dueDate),
  });
  res.status(201).json({ data });
});

const list = asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  const { data, total } = await svc.listUndertakings(req.user, q);
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total } });
});

const upload = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const data = await svc.uploadProof(req.user, id, req.file);
  res.status(201).json({ data });
});

// Streams the file after the scope check; files are never served statically
const file = asyncHandler(async (req, res, next) => {
  const id = parse(idSchema, req.params.id);
  const { absPath, mime, ext } = await svc.getProofFile(req.user, id);
  if (!fs.existsSync(absPath)) throw new HttpError(404, 'FILE_MISSING', 'The stored file is missing');
  res.set({
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="proof-${id}.${ext}"`,
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(absPath, { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

const verify = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const body = parse(verifyBody, req.body);
  const data = await svc.verifyProof(req.user, id, {
    status: body.status,
    remarks: body.remarks,
    newDueDate: body.newDueDate ? toDate(body.newDueDate) : undefined,
  });
  res.json({ data });
});

module.exports = { record, list, upload, file, verify };