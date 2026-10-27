# Stage 4 handoff: Rules engine
Owner: Sanjay Suriya   Date: 2026-10-27   Tag: stage-4-done

## Done
- Working-day maths (Monday to Friday, holidays table, UTC): isWorkingDay, addWorkingDays, workingDaysBetween, loadHolidays
- route_rules table seeded from the selection table in docs/routes.md (4 rules)
- Rules engine of three pure functions: pickRoute, buildSchedule, nextStage. No route names in code; everything comes from data passed in
- persistSchedule: saves a built schedule as one STAGE obligation per stage (works inside a transaction)
- scripts/demoSchedule.js prints the route and dated stages for a sample application

## Done test result
- npm test in server/: <N> passed (29 rules-engine tests, 19 working-day tests, 6 schedule-persistence tests, 2 route_rules seed tests); npm run lint: clean
- node scripts/demoSchedule.js NEW UG 2026-10-26 prints route "Scrutiny + EVC" with due dates 2026-10-28, 11-11, 11-20, 12-11, 12-22, 12-30
- node scripts/demoSchedule.js NEW PHD 2026-10-26 prints UNKNOWN_ATTRIBUTE
- Fresh clone plus .env plus npm run reset plus npm test: passed

## How to run
- After pulling: npm install in server/, then npm run reset (new migration route_rules)
- Demo: node scripts/demoSchedule.js [NEW|EXISTING] [UG|PG|DIPLOMA] [startDate] [GOVERNMENT|PRIVATE|AUTONOMOUS]
- No new env vars

## Endpoints added (also in docs/api-contract.md)
- None

## Tables / enums / services added or changed
- route_rules (new): priority (unique), route_id, institution_types[], new_or_existing[], programme_levels[], active. An empty array means "any". Lowest priority number is checked first; first match wins
- server/src/services/workingDays.js
- server/src/services/rulesData.js: loadRulesContext(prisma) returns ctx = { rules, routes (with stages), holidays (Set of 'YYYY-MM-DD') }
- server/src/services/rulesEngine.js: pickRoute(application, ctx) returns routeId; buildSchedule(application, startDate, ctx) returns { routeId, routeName, stages[] }; nextStage(application, ctx) returns the next stage or null
- server/src/services/scheduleService.js: persistSchedule(db, application, schedule), resolveOwners, ownerIdForRole
- prisma/seed/data.js: ROUTE_RULES; prisma/seed/routeRules.js: seedRouteRules

## Deviations from the plan
- route_rules is a real table with enum-array columns (not a JSON column); one row can cover "UG, DIPLOMA"
- Engine functions take a ctx argument (rules, routes, holidays) so they stay pure and testable without a database; pickRoute and buildSchedule take { institutionType, newOrExisting, programmeLevel }
- addWorkingDays counts days AFTER the start day; n = 0 returns the same day (zero-day stage is due the day it starts)
- Stage dates are chained: stage 1 starts on the start date, each next stage starts on the previous stage's due date
- Stage owner mapping in persistSchedule: OFFICER stages go to the assigned officer; SUPERVISOR stages to the officer's supervisor_id (head office if none); HEAD_OFFICE stages to the head-office user for the officer's region (first head-office user if none); INSTITUTION stages to the assigned officer, because docs/roles.md says institutions are notified through the officer
- persistSchedule throws 409 SCHEDULE_EXISTS if the application already has STAGE obligations
- Engine errors are HttpError with codes UNKNOWN_ATTRIBUTE, NO_ROUTE_MATCH, ROUTE_NOT_FOUND, ROUTE_HAS_NO_STAGES, NO_ROUTE, STAGE_NOT_IN_ROUTE

## Known issues / not done
- Seeded applications (Stage 2) still get their route from a copy of the selection rule in seed code and their obligation dates are set directly; they are NOT built by the rules engine. Replacing that was planned for Stage 4 and was not done
- All stage obligations are created up front, so later due dates are projections from the original start date. Stage 5 must decide whether to recompute the remaining dates when a stage finishes early or late
- persistSchedule does not write an audit_log row; the caller (Stage 5 POST /api/applications) must
- max_days, stage names, route rules and the holiday list are still placeholders, not checked against the handbook; changing them is a data change only
- route_rules.priority is unique, so two rules cannot share a priority
- loadRulesContext reads the database on every call (no caching)
- Institution type is "any" in all four rules, so it does not change the route yet

## Next owner: read these first
- server/src/services/rulesEngine.js, rulesData.js, scheduleService.js, workingDays.js
- server/tests/rulesEngine.test.js: makeCtx shows how to build a ctx without a database
- To create an application: loadRulesContext, then buildSchedule, then create the application, the first stage_history row and persistSchedule inside ONE transaction (pass tx), then logAction
- To move to the next stage: nextStage(application, ctx), then close the current STAGE obligation (state DONE, closed_on)
- Add a fifth route through data only: add the route and its stages in prisma/seed/data.js ROUTES, add one entry to ROUTE_RULES with an unused priority, run npm run reset
- Stage 5 must still use authenticate, requireRole, scopeApplications (AND pattern) and logAction from Stage 3