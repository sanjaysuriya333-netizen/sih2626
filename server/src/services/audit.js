const prisma = require('../utils/prisma');

// Append-only: this is the ONLY code that touches audit_log, and it only creates rows.
async function logAction({ userId = null, action, entity, entityId = null, before = null, after = null }) {
  return prisma.auditLog.create({
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