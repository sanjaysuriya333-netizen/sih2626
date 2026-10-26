// Rules engine: pure functions, no database calls. Everything comes in through ctx.
const { InstitutionType, NewOrExisting, ProgrammeLevel } = require('@prisma/client');
const HttpError = require('../utils/httpError');
const { addWorkingDays, startOfUtcDay } = require('./workingDays');

const ALLOWED = {
  institutionType: Object.values(InstitutionType),
  newOrExisting: Object.values(NewOrExisting),
  programmeLevel: Object.values(ProgrammeLevel),
};

// Empty list in a rule means "any"
const matches = (list, value) => list.length === 0 || list.includes(value);

function checkAttributes(application) {
  for (const [name, allowed] of Object.entries(ALLOWED)) {
    if (!allowed.includes(application[name])) {
      throw new HttpError(400, 'UNKNOWN_ATTRIBUTE', `Unknown or missing ${name}: ${application[name]}`);
    }
  }
}

function getRoute(ctx, routeId) {
  const route = ctx.routes.find((r) => r.id === routeId);
  if (!route) throw new HttpError(404, 'ROUTE_NOT_FOUND', `Route ${routeId} not found or inactive`);
  return route;
}

const sortedStages = (route) => [...route.stages].sort((a, b) => a.orderNo - b.orderNo);

// application = { institutionType, newOrExisting, programmeLevel }  ->  routeId
// Lowest priority number first; first match wins; no match is an error, never a default.
function pickRoute(application, ctx) {
  checkAttributes(application);
  const rule = ctx.rules
    .filter((r) => r.active !== false)
    .sort((a, b) => a.priority - b.priority)
    .find(
      (r) =>
        matches(r.institutionTypes, application.institutionType) &&
        matches(r.newOrExisting, application.newOrExisting) &&
        matches(r.programmeLevels, application.programmeLevel),
    );
  if (!rule) {
    throw new HttpError(
      400,
      'NO_ROUTE_MATCH',
      `No route rule matches ${application.institutionType} / ${application.newOrExisting} / ${application.programmeLevel}`,
    );
  }
  return rule.routeId;
}

// One dated row per stage. Stage 1 starts on startDate; each next stage starts
// when the previous one is due. A zero-day stage is due the day it starts.
function buildSchedule(application, startDate, ctx) {
  const routeId = pickRoute(application, ctx);
  const route = getRoute(ctx, routeId);
  const stages = sortedStages(route);
  if (stages.length === 0) {
    throw new HttpError(400, 'ROUTE_HAS_NO_STAGES', `Route "${route.name}" has no stages`);
  }

  let start = startOfUtcDay(startDate);
  const rows = stages.map((s) => {
    const dueDate = addWorkingDays(start, s.maxDays, ctx.holidays);
    const row = {
      stageId: s.id,
      orderNo: s.orderNo,
      stageName: s.stageName,
      ownerRole: s.ownerRole,
      maxDays: s.maxDays,
      startDate: start,
      dueDate,
    };
    start = dueDate;
    return row;
  });
  return { routeId, routeName: route.name, stages: rows };
}

// application = { routeId, currentStageId }  ->  next stage, or null if it was the last
// currentStageId null (not started) returns the first stage.
function nextStage(application, ctx) {
  if (!application.routeId) throw new HttpError(400, 'NO_ROUTE', 'Application has no route yet');
  const stages = sortedStages(getRoute(ctx, application.routeId));
  if (application.currentStageId == null) return stages[0] || null;

  const index = stages.findIndex((s) => s.id === application.currentStageId);
  if (index === -1) {
    throw new HttpError(400, 'STAGE_NOT_IN_ROUTE', 'Current stage does not belong to this route');
  }
  return stages[index + 1] || null;
}

module.exports = { pickRoute, buildSchedule, nextStage };