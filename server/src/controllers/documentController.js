const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/documentService');

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

const createBody = z.object({
  applicationId: idSchema,
  docType: z.string().trim().min(2, 'Give the document type').max(100),
  validUntil: dateString,
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['VALID', 'EXPIRED', 'REPLACED']).optional(),
  applicationId: idSchema.optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(730).optional(),
});
const renewBody = z.object({ newValidUntil: dateString });
const decisionBody = z
  .object({
    status: z.enum(['ACCEPTED', 'REJECTED']),
    remarks: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'REJECTED' && !v.remarks) {
      ctx.addIssue({ code: 'custom', path: ['remarks'], message: 'Remarks are required when rejecting' });
    }
  });

const create = asyncHandler(async (req, res) => {
  const body = parse(createBody, req.body);
  const data = await svc.createDocument(req.user, {
    applicationId: body.applicationId,
    docType: body.docType,
    validUntil: toDate(body.validUntil),
  });
  res.status(201).json({ data });
});

const list = asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  const { data, total } = await svc.listDocuments(req.user, q);
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total } });
});

// multipart: the text field newValidUntil and the file in field "file"
const renew = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const body = parse(renewBody, req.body || {});
  const data = await svc.requestRenewal(req.user, id, req.file, toDate(body.newValidUntil));
  res.status(201).json({ data });
});

const decide = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const body = parse(decisionBody, req.body);
  const data = await svc.decideRenewal(req.user, id, body);
  res.json({ data });
});

module.exports = { create, list, renew, decide };