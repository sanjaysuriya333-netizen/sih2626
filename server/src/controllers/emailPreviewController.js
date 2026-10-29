const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/emailPreviewService');

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const list = asyncHandler(async (req, res) => {
  const r = query.safeParse(req.query);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  const { data, total, mode } = await svc.listEmails(r.data);
  res.json({ data, meta: { page: r.data.page, pageSize: r.data.pageSize, total, mode } });
});

module.exports = { list };