const { ROUTE_RULES } = require('./data');

// Call this AFTER the routes have been created
async function seedRouteRules(prisma) {
  const routes = await prisma.route.findMany();
  const idByName = Object.fromEntries(routes.map((r) => [r.name, r.id]));

  for (const rule of ROUTE_RULES) {
    const routeId = idByName[rule.route];
    if (!routeId) throw new Error(`route_rules: unknown route "${rule.route}"`);
    await prisma.routeRule.create({
      data: {
        priority: rule.priority,
        routeId,
        institutionTypes: rule.institutionTypes,
        newOrExisting: rule.newOrExisting,
        programmeLevels: rule.programmeLevels,
      },
    });
  }
}

module.exports = { seedRouteRules };