# Stage 5 handoff: Workflow automation (Module A)
Owner: Sanjay Suriya   Date: 2026-10-27   Tag: stage-5-done

## Done
- Create an application (POST /api/applications): validates with zod, picks the route and builds the dated schedule with the Stage 4 engine, then writes the application, the first stage_history row, one STAGE obligation per stage and the audit row in ONE transaction
- Complete a stage (POST /api/applications/:id/stages/complete): scope and stage-owner checks, closes the stage (history and obligation), opens the next stage, re-dates the remaining stage obligations from today, marks the file EVC-ready when it enters an EVC entry stage, closes the file with a decision on the last stage, audit row, all in ONE transaction
- List (filters, pagination), filter options and detail with stage timeline, always through `scopeApplications`
- CSV import with row-level errors, and a mock portal sync (script) that reads the same CSV format
- Frontend: officer home (assigned, due today, overdue), applications list with filters and pagination, application detail with stage timeline and "Complete stage" button, New application form, CSV import screen
- Tests: full-route walk, rollback tests for create and for complete, scope tests on every new endpoint, CSV parser and import tests

## Done test result
- Create an application, complete each stage, see it travel the whole route with the right dates and audit entries: passed as an automated API test (tests/applications.complete.test.js, "walks Scrutiny + EVC end to end...") and by hand in the UI (officer1 creates a file, completes stages; supervisor1 approves the last stage)
- npm test in server/: <N> passed (fill in the final number); npm run seed:check: DEMO NUMBERS OK (tests clean up everything they create); npm run lint: clean (server and client); npm run build in client/: ok
- Fresh clone plus .env plus npm run reset plus npm test: <fill in: passed>

## How to run
- After pulling: npm install in server/ and client/, then npm run reset (new migration evc_ready_flags)
- vitest runs test files one at a time (server/vitest.config.mjs, fileParallelism false) because the API tests share one real database
- Mock portal feed: `npm run portal:sync [file.csv]` in server/ (default server/samples/portal-sync.csv). It adds real files; run npm run reset afterwards to restore the demo numbers
- No new env vars

## Endpoints added (also in docs/api-contract.md)
- POST /api/applications: OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION: create a file and its full schedule
- POST /api/applications/:id/stages/complete: OFFICER, SUPERVISOR, HEAD_OFFICE (within scope and stage owner rule): complete the current stage; `decision` required on the last stage
- GET /api/applications: all roles (rows limited by scope): filters stage, status, officerId, region, dueFrom, dueTo; page, pageSize
- GET /api/applications/filters: all roles: dropdown values (stages, regions, statuses, officers and institutions limited to the caller's scope)
- GET /api/applications/:id: all roles (404 outside scope): detail with timeline, canComplete, isLastStage
- POST /api/applications/import: OFFICER, SUPERVISOR, HEAD_OFFICE: multipart CSV upload

## Tables / enums / services added or changed
- route_stages.is_evc_entry (boolean, default false); applications.evc_ready_on (nullable timestamp); migration `evc_ready_flags`
- Seed: `EVC_ENTRY_STAGE_NAMES` in prisma/seed/data.js; prisma/seed/evcReady.js flags the stages and sets evc_ready_on for seeded files at or past the entry stage (called last in seed.js)
- server/src/services/audit.js: `logAction(entry, db = prisma)`; pass the transaction client as `db`
- server/src/services/applicationService.js: `createApplication(user, input)`
- server/src/services/stageService.js: `completeStage(user, applicationId, input)`, `canCompleteStage(userRole, stageOwnerRole)`, internal `rescheduleRemaining`
- server/src/services/applicationQueryService.js: `listApplications`, `getApplication`, `getFilterOptions`
- server/src/services/importService.js: `importApplications(user, csvText, { source })`; server/src/utils/csv.js: `parseCsv`; server/src/middleware/uploadCsv.js (multer memory storage, .csv only, 2 MB)
- server/src/services/portalSyncMock.js: `runPortalSync(user, filePath)`; server/scripts/portalSync.js; server/samples/portal-sync.csv
- Client: pages OfficerHome, ApplicationsList, ApplicationDetail, NewApplication, ImportApplications, ComingSoon; components/StatusChip.jsx; hooks/useFetch.js; utils/format.js (IST display helpers); App.jsx routes; Sidebar menu per role

## How a file becomes EVC-ready (for Stage 6)
- `route_stages.is_evc_entry = true` marks the stage where a file enters the EVC queue. The seed marks the stage named "EVC scheduling" (data: EVC_ENTRY_STAGE_NAMES in seed/data.js); no stage name is used in application code
- `applications.evc_ready_on` is set (to the time of entry) the first time a file enters such a stage, either through stage completion or at creation if the first stage is an EVC entry stage. Seeded files already at or past that stage got it at seed time
- Stage 6's queue should be: evc_ready_on is not null, status IN_PROGRESS, and no EVC visit scheduled or completed yet. `GET /api/applications/:id` and the list return `evcReadyOn`
- Completing the EVC entry stage through POST .../stages/complete moves the file on; it does NOT create an EVC visit. Stage 6 decides how scheduling relates to stage completion

## How stage obligations are created (for Stage 6 and 7)
- Files created through the API get ALL their STAGE obligations up front (kind STAGE, ref_id = route_stages.id, state OPEN). Seeded files only have ONE open obligation, for the current stage; completing a stage creates the next stage's obligation if it does not exist
- On every stage completion, all not-DONE STAGE obligations of that file are re-dated by chaining addWorkingDays from today using each stage's max_days
- Owner of a stage obligation: OFFICER stages = assigned officer; SUPERVISOR stages = the officer's supervisor (head office if none); HEAD_OFFICE stages = head-office user of the officer's region (first head-office user if none); INSTITUTION stages = the assigned officer. Helpers: scheduleService.resolveOwners and ownerIdForRole
- Audit action names: APPLICATION_CREATED, STAGE_COMPLETED, APPLICATIONS_IMPORTED

## Deviations from the plan
- Two extra columns (is_evc_entry, evc_ready_on) to implement "mark the file as ready for the EVC queue" without stage names in code
- logAction takes an optional transaction client so an audit row commits or rolls back with its change
- Application codes are APP-<year>-<number padded to 4>, highest existing number plus 1, generated inside the create transaction under a Postgres advisory lock (`SELECT pg_advisory_xact_lock(26262)`, one raw SQL statement with no user input) so two simultaneous creates never get the same code
- vitest runs test files serially (server/vitest.config.mjs) because API tests share one database
- Who may complete a stage (decision, not in the guide): stage owner OFFICER or INSTITUTION: officer, supervisor or head office; owner SUPERVISOR: supervisor or head office; owner HEAD_OFFICE: head office only; always within the caller's data scope. Institutions never complete stages
- Last stage: `decision` (APPROVED or REJECTED) is required and closes the file (status set, closed_on set); on any other stage `decision` is rejected
- Who gets a new file: officer = self; supervisor and head office must name an officer (supervisor: own team only); institution: own institution forced, officer with the fewest IN_PROGRESS files in the institution's region is assigned (409 NO_OFFICER_AVAILABLE if none)
- List is sorted newest first (id descending), not by due date; dueFrom/dueTo match the due date of the file's CURRENT stage only
- CSV import: limits of 200 rows and 2 MB, in-house parser (no new dependency), each valid row imported in its own transaction (partial import), plus one summary audit row; mock portal sync is a script (npm run portal:sync) and not an endpoint
- Extra endpoint GET /api/applications/filters (and a New application screen) were added for the UI
- Dates are stored in UTC and shown in IST in the client
- Tests that create data through the API delete their own rows afterwards (including their audit rows) so the demo numbers stay correct. This deletion exists only in test code

## Known issues / not done
- Seeded files only have the current stage's obligation (later ones are created when a stage completes); seeded due dates are set directly, not from max_days
- Seeded due dates sit on UTC midnight while the client's "today" is the IST date, so the "due today" count can differ for a few hours around midnight
- The sidebar is hidden on narrow screens (existing Layout behaviour); a mobile menu is not built
- The EVC and undertakings sidebar links and Settings open a "Coming soon" page
- Institutions can create applications but have no dashboard yet (Stages 6 and 9)
- No client tests
- No notification is created for any Stage 5 action (notifications start in Stages 6 and 7)
- Stage names, max_days, route rules and holidays are still placeholders, not checked against the handbook
- `npm run portal:sync` adds files to whatever database you are using (use reset to clean up)

## Next owner: read these first
- server/src/services/stageService.js (the transaction pattern: claim the move with updateMany, close history and obligation, rescheduleRemaining, logAction with tx)
- server/src/services/applicationService.js, scheduleService.js (resolveOwners, ownerIdForRole), rulesEngine.js, rulesData.js, workingDays.js
- server/src/services/applicationQueryService.js (how to combine scopeApplications with filters), importService.js and middleware/uploadCsv.js (multer pattern; Stage 6 needs disk storage for proofs)
- server/tests/applications.complete.test.js and applications.read.test.js (API test patterns with cleanup)
- client/src/hooks/useFetch.js, utils/format.js, components/StatusChip.jsx, pages/ApplicationDetail.jsx
- RULES that still apply: every application query uses where: { AND: [{ id }, scopeApplications(req.user)] } (never spread the scope); every write calls logAction inside its transaction; every endpoint gets a row in docs/api-contract.md; client component files export only components
-