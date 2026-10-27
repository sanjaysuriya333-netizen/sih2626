const { EVC_ENTRY_STAGE_NAMES } = require('./data');

// Run AFTER routes and applications are seeded
async function seedEvcReady(prisma) {
  await prisma.routeStage.updateMany({
    where: { stageName: { in: EVC_ENTRY_STAGE_NAMES } },
    data: { isEvcEntry: true },
  });
  // Seeded files already at or past the EVC entry stage count as EVC-ready
  const entries = await prisma.routeStage.findMany({ where: { isEvcEntry: true } });
  for (const entry of entries) {
    await prisma.application.updateMany({
      where: { routeId: entry.routeId, currentStage: { is: { orderNo: { gte: entry.orderNo } } } },
      data: { evcReadyOn: new Date() },
    });
  }
}

module.exports = { seedEvcReady };