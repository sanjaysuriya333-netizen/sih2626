# Stage 7 handoff: Document validity and the daily job (Modules E and F, part 1)
Owner: Sanjay Suriya   Date: 2026-10-28   Tag: stage-7-done

## Done
- Documents: staff or the institution add a document to a file (type + valid_until). This creates the document and a DOCUMENT obligation due on the expiry date, in ONE transaction
- Document reminders at 90, 60 and 30 days before expiry (alert_rules data; the daily job sends them)
- Renewal flow: the institution uploads the renewed file with its new expiry date (PDF, JPG or PNG, same upload rules as undertaking proofs); an officer in scope accepts or rejects. Accept: old document becomes REPLACED (closed_on set, replaced_by_id points to the new one), its obligation becomes DONE, a new VALID document and a new OPEN obligation (level 0) are created, the institution is notified. Reject: remarks required, the old document stays as it was, the institution can upload again. Rejected renewal files stay as history
- Alert ladder (services/ladder.js, pure functions) and the daily job (jobs/dailyCheck.js): every open obligation of all four kinds is moved along the ladder, one transition = one state change + notifications + ONE audit row, each obligation in its own transaction
- Idempotent: running twice on the same day sends nothing new (compare-and-set on `last_alert_level`)
- `asOf` date parameter to simulate any day
- Scheduling: node-cron at 06:00 IST, started from server.js only (never in tests); `DISABLE_CRON=true` turns it off
- POST /api/admin/run-daily-check?asOf=YYYY-MM-DD (HEAD_OFFICE only), writes one DAILY_CHECK_RUN audit row
- Frontend: "Documents expiring soon" widget (institution home<fill in: and officer home, or "officer home not done">), Documents page (add document, tabs, renew form for institutions, accept/reject for staff), Daily check page for head office with a date picker and a "Run daily check now" button, sidebar links, StatusChip colours for VALID, EXPIRED, REPLACED
- Tests: ladder (pure functions), daily check (STAGE, EVC, UNDERTAKING, DOCUMENT lifecycles, idempotency, far `asOf`, ignores stages not yet reached, rollback of one obligation only), documents (create, list, renew upload limits, download scope, accept, reject, scope, rollbacks), admin (roles, bad date, audit row, cron settings)

## Done test result
- Change a date in the seed data, run the daily check twice, see exactly one correct alert: <fill in: what you did and saw in the Daily check page and the notifications table>
- A lease 60 days ahead gives a reminder now; an expired lease escalates after the grace period: <fill in: asOf dates used and what happened>. Also covered by tests/dailyCheck.test.js (DOCUMENT lifecycle)
- Renewal walked by hand (institution1 uploads, officer1 accepts, old document under Replaced): <fill in: yes/no>
- npm test in server/: <N> passed (fill in from the "Tests" line, run from server/ and not from the repo root)
- npm run seed:check: DEMO NUMBERS OK; npm run lint: clean (server and client); npm run build in client/: <fill in: ok>
- Fresh clone plus .env plus npm run reset plus npm test: <fill in: passed>

## How to run
- After pulling: npm install in server/ and client/, then npm run reset (two new migrations: `documents_renewal`, `document_renewal_request`)
- New env var: `DISABLE_CRON` (default false), listed in .env.example. Set it to true when you run several server copies or do not want the 06:00 run
- Run all server commands from `server/`. Running `npx vitest` from the repo root ignores vitest.config (files run in parallel against one database) and makes the count-based tests fail
- Daily check from the UI: log in as head1@demo.test, sidebar "Daily check". Running it changes seeded obligation states; `npm run reset` restores the seed and the demo numbers

## The asOf usage
- API: POST /api/admin/run-daily-check?asOf=2026-12-01 (HEAD_OFFICE). No asOf means today in IST. Bad dates give 400
- UI: Daily check page, "Run as of" date picker
- Code: `runDailyCheck({ asOf: Date, obligationIds?: number[] })` returns `{ asOf, checked, fired, skipped, failed, transitions, failures }`. `runDailyCheckAudited({ asOf, userId })` also writes the DAILY_CHECK_RUN audit row. `obligationIds` exists for tests only, so a test can run the job for its own obligations and never touch the seed
- Time travel: run day 0, then +10, then +30. A later date fires the latest applicable step per obligation (skipped steps are not sent late). Levels only go up, so running an earlier date afterwards does nothing. Running the same date twice does nothing
- Demo recipe: the seeded lease deed on APP-2026-0001 expires 60 days after the seed day. Run for today: one reminder "expires on <date> (in 60 days)" to the file's officer. Run again: nothing. Run as of expiry + 1 day: OVERDUE and the document becomes EXPIRED. Expiry + 3 days: ESCALATED to the officer's supervisor. Expiry + 7 days: REPORTED to head office

## Ladder transition table
Steps are numbered 1..n per obligation kind by sorting that kind's active alert_rules by `days_before`, largest first (rules with the same days_before, one per channel, share a step). `obligations.last_alert_level` stores the step that fired last. A step fires only if it is higher than the stored one. With the seeded rules:

| Kind | Steps (days_before) | Level reached |
| --- | --- | --- |
| STAGE | 1: 2, 2: 0, 3: -1, 4: -3, 5: -7 | REMINDER_SENT, DUE_TODAY, OVERDUE, ESCALATED, REPORTED |
| EVC | 1: 7, 2: 3, 3: 1, 4: 0, 5: -1, 6: -3, 7: -7 | REMINDER_SENT x3, DUE_TODAY, OVERDUE, ESCALATED, REPORTED |
| UNDERTAKING | 1: 5, 2: 0, 3: -1, 4: -3, 5: -7 | REMINDER_SENT, DUE_TODAY, OVERDUE, ESCALATED, REPORTED |
| DOCUMENT | 1: 90, 2: 60, 3: 30, 4: 0, 5: -1, 6: -3, 7: -7 | REMINDER_SENT x3, DUE_TODAY, OVERDUE, ESCALATED, REPORTED |

`daysToDue`: STAGE, EVC and UNDERTAKING count WORKING days (workingDaysBetween: working days after `asOf` up to and including the due date, negative when past). DOCUMENT counts CALENDAR days. A step is due when `days_before >= daysToDue`.

| State reached | Trigger (daysToDue) | Recipient (rule recipient_role) | Notification subject and body (label = "Stage "<name>" of APP-..." / "EVC visit of APP-..." / "Undertaking of APP-..." / "<doc type> of APP-...") |
| --- | --- | --- | --- |
| REMINDER_SENT | reaches a reminder step | OWNER = the obligation's owner | "Reminder: <label>" / "<label> is due on <date> (in N working days)." For documents: "expires on <date> (in N days)" |
| DUE_TODAY | 0 | OWNER | "Due today: <label>" / "<label> is due on <date>." (documents: "expires on") |
| OVERDUE | -1 | OWNER | "Overdue: <label>" / "<label> was due on <date> and is now N working days overdue." (documents: "expired on ...", N days) |
| ESCALATED | -3 | SUPERVISOR = owner's supervisor_id, else the head-office user of the region | "Escalated: <label>" / "... overdue. It has been escalated to you." |
| REPORTED | -7 | HEAD_OFFICE = head-office user of the region, else the first active one | "Reported: <label>" / "... overdue. It is being reported to head office." |

Extra effects: when a DOCUMENT obligation reaches a step with daysToDue below 0, its document status moves VALID to EXPIRED in the same transaction (the obligation stays open until a renewal is accepted). A document is still VALID on its last day (DUE_TODAY).
Skipped steps: if the job jumps over steps (far `asOf`, or a rule added later), only the latest applicable step fires and the level is raised past the others. The 90-day reminder is therefore not sent for a lease that is already 60 days away.

## Endpoints added (also in docs/api-contract.md)
- POST /api/documents: all roles (scoped; institution only its own files): add a document and its obligation
- GET /api/documents: all roles (scoped): list with `daysToExpiry`, `obligationState`, pending `renewal`, proofs; filters status, applicationId, expiringWithinDays (1 to 730), page, pageSize
- POST /api/documents/:id/renew: INSTITUTION (own institution): multipart, field `newValidUntil` plus file in field `file`
- POST /api/documents/:id/renewal-decision: OFFICER, SUPERVISOR, HEAD_OFFICE (scoped): ACCEPTED, or REJECTED with remarks
- POST /api/admin/run-daily-check: HEAD_OFFICE: run the job now, optional `asOf`
- GET /api/proofs/:id/file: now also serves document-renewal files (scope-checked through the document)

## Tables / enums / services added or changed
- documents: new columns `created_at`, `closed_on`, `replaced_by_id` (unique, self relation "Renewal": old.replacedBy = new), `renewal_valid_until` (the expiry the institution asked for while a renewal waits), indexes (application_id, status) and (valid_until, status). DocumentStatus (VALID, EXPIRED, REPLACED) unchanged
- proofs: owner_type DOCUMENT is now used (owner_id = documents.id). Several proofs per document are kept as history
- alert_rules: DOCUMENT reminders are 90, 60 and 30 days (LEAD_DAYS.DOCUMENT in prisma/seed/data.js). No `step` column: steps are computed (see the ladder table)
- Seed: prisma/seed/documents.js adds 4 demo documents (APP-2026-0001 Lease deed +60 days and Fire safety certificate +100, APP-2026-0002 Lease deed +45, APP-2026-0005 Affiliation certificate +20), each with an OPEN DOCUMENT obligation at level 0. Called from prisma/seed.js after seedApplications. checkDemo.js prints an extra information line about documents (not part of the pass/fail check)
- services/ladder.js: buildLadder, buildLadders, computeDaysToDue, pickTransition, alertMessage, CALENDAR_KINDS
- services/notifyService.js: new `sendAlert(db, { deliveries: [{ userId, channel }], subject, body, obligationId })`. Stage 7 writes IN_APP rows only; EMAIL and SMS deliveries are skipped. This is the ONE function Stage 8 replaces with the channel interface. notifyInstitutionUsers is unchanged
- services/documentService.js: createDocument, listDocuments, requestRenewal, decideRenewal, findScopedDocumentProof
- services/undertakingService.js: getProofFile now also finds document-renewal proofs; verifyProof is unchanged (a renewal file cannot be verified through the undertaking endpoint)
- jobs/dailyCheck.js: runDailyCheck, runDailyCheckAudited, todayInIst. jobs/scheduler.js: startScheduler, runScheduled, DAILY_CRON, TIMEZONE
- controllers/documentController.js, adminController.js; routes/documents.js, admin.js (mounted in routes/index.js)
- Client: pages Documents.jsx, Admin.jsx; component DocumentsExpiring.jsx; Home.jsx (widget for institutions); App.jsx routes /documents and /admin (HEAD_OFFICE); Sidebar links Documents and Daily check

## Audit action names
- DOCUMENT_CREATED, DOCUMENT_RENEWED, DOCUMENT_RENEWAL_REJECTED (entity document); DOCUMENT_RENEWAL_UPLOADED (entity proof)
- ALERT_REMINDER_SENT, ALERT_DUE_TODAY, ALERT_OVERDUE, ALERT_ESCALATED, ALERT_REPORTED (entity obligation, user_id null = the system; after holds kind, daysToDue, asOf, notifications, documentExpired)
- DAILY_CHECK_RUN (entity daily_check; user_id = the head-office user, null when the cron ran it)

## Deviations from the plan
- Reminder steps are computed from the sorted rules instead of adding a `step` column to alert_rules
- DOCUMENT is counted in calendar days (90, 60 and 30 days before a date), the other kinds in working days
- A far `asOf` fires only the latest applicable step instead of every missed step
- The job skips STAGE obligations of stages the file has not reached, and of files that are not IN_PROGRESS (the schedule creates one obligation per stage at submission, so without this the job would alert for future stages)
- Documents got extra columns (created_at, closed_on, replaced_by_id, renewal_valid_until) beyond the plan; the renewal request is held on the old document until the officer decides
- The renewal decision has its own endpoint keyed by document id (POST /api/documents/:id/renewal-decision) instead of reusing POST /api/proofs/:id/verify, because the new expiry date and the closing of the old record belong to the document
- Notifications are IN_APP only (EMAIL and SMS rules are skipped until Stage 8)
- Duplicate documents: the same type (case-insensitive) on the same file while a VALID or EXPIRED one exists gives 409 ALREADY_EXISTS (renew instead)
- EVC lateness moves the EVC obligation OPEN to OVERDUE and onward; the visit status stays PLANNED (the UI keeps showing LATE)

## Known issues / not done
- Friday/Saturday: an item due on a Friday and checked on a Saturday counts as 0 working days, so it can read DUE_TODAY until Monday (unit-tested, accepted)
- Step numbers are positions in the active rules. If Stage 8 edits days_before or adds or removes a rule, the stored last_alert_level of open obligations no longer lines up with the new steps. Stage 8 must decide how settings changes are applied (see the Stage 8 kickoff)
- Document obligations keep alerting on files that are REJECTED or CLOSED (only STAGE obligations are filtered by file status)
- Notification rows are created but nothing shows them yet (bell and notification page are Stage 8)
- Running the daily check on the seeded data changes obligation states and the demo numbers until `npm run reset`
- The admin result shows the first 100 transitions and 20 failures only
- Officer home widget: <fill in: added, or "not added; DocumentsExpiring is ready to drop into OfficerHome.jsx">
- No client tests; the browser walkthrough was done by hand
- Stage names, max_days and the 7-day notice are still placeholders, not checked against the handbook (unchanged from Stage 6)

## Next owner: read these first
- server/src/services/ladder.js (steps, calendar vs working days, `pickTransition`, message texts)
- server/src/jobs/dailyCheck.js (`applyStep`: compare-and-set, recipients, `notifyService.sendAlert`, audit row) and jobs/scheduler.js
- server/src/services/notifyService.js (`sendAlert` is where the channel interface plugs in) and services/scheduleService.js (`resolveOwners` gives OFFICER, SUPERVISOR, INSTITUTION, HEAD_OFFICE; the job maps the rule role OWNER to the obligation's own owner)
- server/prisma/seed/data.js (`buildAlertRules`, LEAD_DAYS) and the alert_rules table
- server/src/services/documentService.js and tests/documents.test.js, tests/dailyCheck.test.js (test patterns: fixed 2027 dates, `obligationIds`, cleanup of everything the test created, rollback spies on `audit.logAction`, `notifyService.sendAlert`, `notifyService.notifyInstitutionUsers`, `scheduleService.resolveOwners`)
- RULES that still apply: every application query uses where: { AND: [{ id }, scopeApplications(req.user)] }; every write calls logAction inside its transaction; every endpoint gets a row in docs/api-contract.md; new env vars go into .env.example in the same commit; client component files export only components; run all server commands from server/
-