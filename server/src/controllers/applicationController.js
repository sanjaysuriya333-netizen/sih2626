const { z } = require('zod');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const applicationService = require('../services/applicationService');
const stageService = require('../services/stageService');
const queryService = require('../services/applicationQueryService');
const importService = require('../services/importService');

const createSchema = z.object({
  institutionId: z.number().int().positive().optional(),
  newOrExisting: z.enum(['NEW', 'EXISTING']),
  programmeLevel: z.enum(['UG', 'PG', 'DIPLOMA']),
  submittedOn: z.coerce.date().optional(),
  assignedOfficerId: z.number().int().positive().optional(),
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid application data', parsed.error.issues);
  }
  const created = await applicationService.createApplication(req.user, parsed.data);
  res.status(201).json({ data: created });
});

const completeSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']).optional(),
  remarks: z.string().trim().max(500).optional(),
});

exports.completeStage = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.issues);
  }
  const result = await stageService.completeStage(req.user, id, parsed.data);
  res.json({ data: result });
});

const listSchema = z
  .object({
    stage: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['IN_PROGRESS', 'APPROVED', 'REJECTED', 'CLOSED']).optional(),
    officerId: z.coerce.number().int().positive().optional(),
    region: z.string().trim().min(1).max(100).optional(),
    dueFrom: z.coerce.date().optional(),
    dueTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => !q.dueFrom || !q.dueTo || q.dueFrom <= q.dueTo, {
    message: 'dueFrom must not be after dueTo',
    path: ['dueFrom'],
  });

exports.list = asyncHandler(async (req, res) => {
  // empty query values (an unused filter box) count as "not set"
  const query = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ''));
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid filters', parsed.error.issues);
  }
  const { data, meta } = await queryService.listApplications(req.user, parsed.data);
  res.json({ data, meta });
});

exports.getOne = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  res.json({ data: await queryService.getApplication(req.user, id) });
});

exports.filters = asyncHandler(async (req, res) => {
  res.json({ data: await queryService.getFilterOptions(req.user) });
});

exports.importCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Upload a CSV file in the "file" field');
  // the real content must be text: binary files contain zero bytes
  if (req.file.buffer.includes(0)) throw new HttpError(400, 'INVALID_FILE', 'The file is not a text CSV');
  const result = await importService.importApplications(req.user, req.file.buffer.toString('utf8'));
  res.json({ data: result });
});