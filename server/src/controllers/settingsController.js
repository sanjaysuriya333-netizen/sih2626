const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/settingsService');

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  return r.data;
}

const idSchema = z.coerce.number().int().positive();
const kindSchema = z.enum(['STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT']);
const stepsBody = z.object({
  daysBefore: z.array(z.number().int().min(-365).max(365)).min(1).max(20),
});
const ruleBody = z
  .object({
    active: z.boolean().optional(),
    channel: z.enum(['EMAIL', 'IN_APP', 'SMS']).optional(),
    recipientRole: z.enum(['OWNER', 'SUPERVISOR', 'HEAD_OFFICE']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');
const evcBody = z.object({ minNoticeDays: z.number().int().min(0).max(30) });

const get = asyncHandler(async (req, res) => {
  res.json({ data: await svc.getSettings() });
});

const putSteps = asyncHandler(async (req, res) => {
  const kind = parse(kindSchema, req.params.kind);
  const body = parse(stepsBody, req.body);
  res.json({ data: await svc.updateSteps(req.user, kind, body.daysBefore) });
});

const patchRule = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const body = parse(ruleBody, req.body);
  res.json({ data: await svc.updateRule(req.user, id, body) });
});

const patchEvc = asyncHandler(async (req, res) => {
  const body = parse(evcBody, req.body);
  res.json({ data: await svc.updateEvcMinNotice(req.user, body.minNoticeDays) });
});

module.exports = { get, putSteps, patchRule, patchEvc };