const { z } = require('zod');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const applicationService = require('../services/applicationService');

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