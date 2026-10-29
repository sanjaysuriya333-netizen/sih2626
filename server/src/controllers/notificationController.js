const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const svc = require('../services/notificationService');

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
  return r.data;
}

const idSchema = z.coerce.number().int().positive();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.enum(['true', 'false']).optional(),
});

const list = asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  const { data, total } = await svc.listNotifications(req.user, { ...q, unread: q.unread === 'true' });
  res.json({ data, meta: { page: q.page, pageSize: q.pageSize, total } });
});

const unreadCount = asyncHandler(async (req, res) => {
  res.json({ data: { unread: await svc.unreadCount(req.user) } });
});

const read = asyncHandler(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json({ data: await svc.markRead(req.user, id) });
});

const readAll = asyncHandler(async (req, res) => {
  res.json({ data: await svc.markAllRead(req.user) });
});

module.exports = { list, unreadCount, read, readAll };