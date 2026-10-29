# Stage 9 handoff: Dashboards and reports (Module B)
Owner: Sanjay Suriya   Date: 2026-10-29   Tag: stage-9-done

## Done
- Aggregate endpoints under `/api/dashboard` (summary, breakdown, ageing, stage-durations). Every number is computed from the caller's scope (`scopeApplications`) in `services/dashboardService.js`
- Four role dashboards on shared components (`StatCard`, `BarCard`, `AgeingCard`, `FileTable`, `SlideTable`, `FilterBar`):
  - Officer: my files, due today, due this week, overdue, ageing, documents expiring soon (the widget Stage 7 left out is now added)
  - Supervisor: team cards, files per officer (in progress, overdue, escalated), team files past their date, ageing
  - Head office: the slide numbers (128, 14, 6, 2 on a fresh seed), pending by region and by stage, bottleneck chart (average days per stage), ageing, the slide-10 table, saved filter bar
  - Institution: my applications, promises to submit, documents expiring, the slide-10 table
- Reports for OFFICER, SUPERVISOR, HEAD_OFFICE (scoped): pending work, overdue items, compliance history. Screen with paging and filters, plus CSV export. One `REPORT_EXPORTED` audit row per export, written before the file is sent
- Filters (region, stage, date range) saved per user in the browser (`hooks/useSavedFilters.js`), used on the Reports page and the head-office dashboard
- Load data: `npm run seed:load` adds 5,000 applications (codes `LOAD-00001` and up); `npm run seed:load -- --clean` removes them. `npm run perf:check` times every dashboard page and report against the 3-second target
- `docs/verify-dashboards.sql`: direct SQL for every dashboard number

## Done test result
- Each dashboard number equals a direct SQL count: <fill in: psql -U postgres -d sih26262 -f docs\verify-dashboards.sql compared with the cards and charts, on the fresh seed and again with load data>
- Head office cards on a fresh seed read 128 / 14 / 6 / 2: <fill in: yes/no>
- 5,000-record load test: <fill in: the perf:check table (first load ms, worst warm ms, result per page)>
- `npx vitest run --silent tests/dashboard.test.js tests/reports.test.js` with load data present: <fill in: passed/failed>
- `npx vitest run --silent` in server/ (no load data): <N> tests passed in <N> files
- `npm run seed:check`: <fill in: DEMO NUMBERS OK after npm run reset, or after seed:load -- --clean>
- `npm run lint` clean in server/ and client/: <fill in>; `npm run build` in client/: <fill in>
- Fresh clone plus .env plus `npm run reset` plus `npm test`: <fill in>

## How to run
- No new migration, no new env var
- New commands in server/: `npm run seed:load`, `npm run seed:load -- --clean`, `npm run perf:check`
- While load data exists: `npm run seed:check` shows a mismatch (that is expected), and the daily check or the 06:00 cron would send thousands of alerts. Set `DISABLE_CRON=true` and do not run the daily check. Remove the load data (`--clean`) or run `npm run reset` before the demo
- Run every server command from `server\`

## Dashboard definitions (the rules the SQL file follows)
- "Today" is the IST date. "Due this week" is today to today + 6 (the same window as `npm run seed:check`), STAGE obligations in OPEN, REMINDER_SENT or DUE_TODAY
- A STAGE obligation is counted only for the stage the file is at now and only while the file is IN_PROGRESS (the schedule creates one obligation per stage at submission, so a plain count would include future stages). EVC, UNDERTAKING and DOCUMENT obligations always count
- `overdue`, `escalated`, `reported`: open obligations of ALL kinds in that state
- Breakdown by region, stage, institution and officer counts IN_PROGRESS files; its `overdue` and `escalated` (ESCALATED or REPORTED) come from the file's current stage obligation. `by=status` counts all files
- Ageing: calendar days since `submitted_on`, IN_PROGRESS files, buckets 0-7, 8-14, 15-30, 31-60, 61+
- Stage durations: average calendar days from `entered_on` to `completed_on` over closed `stage_history` rows, grouped by stage name

## Endpoints added (also in docs/api-contract.md)
- GET /api/dashboard/summary: all roles (scoped): cards and counts per kind and state
- GET /api/dashboard/breakdown: all roles (scoped): `by` = status, stage, region, institution, officer
- GET /api/dashboard/ageing: all roles (scoped): ageing buckets
- GET /api/dashboard/stage-durations: all roles (scoped): average days per stage
- GET /api/reports/:type: OFFICER, SUPERVISOR, HEAD_OFFICE (scoped): `pending`, `overdue` or `compliance`, paged
- GET /api/reports/:type/export: OFFICER, SUPERVISOR, HEAD_OFFICE (scoped): CSV download, audited

## Tables / enums / services added or changed
- No schema change, no migration
- `services/dashboardService.js` (exports `buildWhere` for the reports), `services/reportService.js`, `utils/csvWrite.js`, controllers `dashboardController.js` and `reportController.js`, routes `dashboard.js` and `reports.js` (mounted in `routes/index.js`)
- `prisma/seedLoad.js`, `scripts/perfCheck.js`, scripts in `package.json`
- Client: components `StatCard`, `BarCard`, `AgeingCard`, `FileTable`, `SlideTable`, `FilterBar`; hook `useSavedFilters`; pages `OfficerHome`, `SupervisorHome`, `HeadOfficeHome`, `InstitutionHome`, `Reports`; `Home.jsx`, `Sidebar.jsx` and `App.jsx` changed
- Audit action: `REPORT_EXPORTED` (entity `report`; after has report, filters, rows)
- `docs/roles.md`: new row "View and export reports" (officer, supervisor, head office)
- Tests added: `dashboard.test.js`, `reports.test.js`

## Deviations from the plan
- Reports are CSV only. PDF export is not built (second item on the cut list)
- Reports are for staff only; institutions get 403
- The compliance CSV is capped at 1,000 files (400 `TOO_MANY_ROWS`); filter by region or stage first
- Dashboard numbers count only the current-stage obligation of a file, not every STAGE obligation (see the definitions above). On the seed this gives exactly the `seed:check` numbers
- The "Past their due date" lists on the officer and supervisor homes are by date; the "Overdue" card counts the state OVERDUE. A file can be past its date before the daily check marks it, so the list can be longer than the card
- Saved filters live in the browser (localStorage), not on the server
- Dashboard reads write no audit row; only CSV exports do

## Known issues / not done
- The dashboard service loads all scoped applications and open obligations into memory for each call (the head-office page makes five calls). Fine for thousands of files; for tens of thousands, move the grouping into SQL
- The `seed:check` window uses the UTC date and the dashboards use the IST date; they differ only between 00:00 and 05:30 IST
- Breakdown by stage groups by stage NAME across routes (the same name sits at different positions on different routes)
- The overdue report lists obligations, so one file can appear more than once (for example a late stage and an expired document)
- `npm run perf:check` does not time the CSV export, because every export writes an audit row. The CSV runs the same query as the screen without paging
- The bottleneck chart on the plain seed is a spread of similar bars; a real bottleneck needs stages completed at different speeds
- `docs/api-contract.md` stray rows from earlier stages: <fill in: cleaned up / still there>
- No client tests; the browser walkthrough was done by hand
- Stage names, `max_days` and the 7-day notice are still placeholders, not checked against the handbook

## Next owner: read these first
- `server/src/services/dashboardService.js` (`loadContext`, `buildWhere`) and `reportService.js`: all numbers and reports come from here
- `docs/verify-dashboards.sql`: the SQL that must agree with the screens. Use it in the Stage 10 end-to-end script
- `server/prisma/seedLoad.js` and `server/scripts/perfCheck.js`: the load data and the timing check
- Security table for Stage 10: report and dashboard endpoints check role and scope on the server; CSV cells starting with `=`, `+`, `-` or `@` are prefixed with `'`; exports are audited. The report endpoints have no rate limit, and the compliance export can read up to 1,000 files
- RULES that still apply: every application query goes through `scopeApplications` (never spread the scope); every write calls `logAction` inside its transaction; every endpoint gets a row in `docs/api-contract.md`; new env vars go into `.env.example` in the same commit; client component files export only components; run all server commands from `server\`; tests that create data delete it afterwards so `npm run seed:check` still prints DEMO NUMBERS OK
-