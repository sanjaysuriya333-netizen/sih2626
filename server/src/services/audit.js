const prisma = require('../utils/prisma');

// Append-only: this is the ONLY code that touches audit_log, and it only creates rows.
// Pass a transaction client as `db` so the audit row commits or rolls back with the change.
async function logAction(
  { userId = null, action, entity, entityId = null, before = null, after = null },
  db = prisma,
) {
  return db.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      beforeJson: before ?? undefined,
      afterJson: after ?? undefined,
    },
  });
}

module.exports = { logAction };