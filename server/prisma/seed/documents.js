// Demo documents for approved files. Dates are relative to today (like the applications seed).
// They are OPEN with alert level 0, never OVERDUE or ESCALATED, so the demo numbers
// (128 / 14 / 6 / 2) are unchanged. The daily job (Stage 7) sends their reminders.
const DOCS = [
  { appCode: 'APP-2026-0001', docType: 'Lease deed', inDays: 60 }, // the "lease 60 days ahead" demo
  { appCode: 'APP-2026-0001', docType: 'Fire safety certificate', inDays: 100 },
  { appCode: 'APP-2026-0002', docType: 'Lease deed', inDays: 45 },
  { appCode: 'APP-2026-0005', docType: 'Affiliation certificate', inDays: 20 },
];

async function seedDocuments(prisma) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const d of DOCS) {
    const app = await prisma.application.findUnique({ where: { appCode: d.appCode } });
    if (!app || !app.assignedOfficerId) throw new Error(`documents seed: ${d.appCode} not found or has no officer`);
    const validUntil = new Date(today.getTime() + d.inDays * 86400000);
    const doc = await prisma.document.create({
      data: { applicationId: app.id, docType: d.docType, validUntil },
    });
    // The DOCUMENT obligation is due on expiry; the owner is the file's assigned officer
    await prisma.obligation.create({
      data: {
        kind: 'DOCUMENT',
        refId: doc.id,
        applicationId: app.id,
        ownerId: app.assignedOfficerId,
        dueDate: validUntil,
      },
    });
  }
  console.log(`Documents seeded: ${DOCS.length}`);
}

module.exports = { seedDocuments };