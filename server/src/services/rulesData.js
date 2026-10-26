const { loadHolidays } = require('./workingDays');

// Loads everything the rules engine needs, once, so the engine itself stays pure.
// ctx = { rules, routes (each with stages sorted by order_no), holidays (Set) }
async function loadRulesContext(prisma) {
  const [rules, routes, holidays] = await Promise.all([
    prisma.routeRule.findMany({ where: { active: true }, orderBy: { priority: 'asc' } }),
    prisma.route.findMany({
      where: { active: true },
      include: { stages: { orderBy: { orderNo: 'asc' } } },
    }),
    loadHolidays(prisma),
  ]);
  return { rules, routes, holidays };
}

module.exports = { loadRulesContext };