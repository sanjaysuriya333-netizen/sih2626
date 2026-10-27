# Stage 6 handoff: EVC scheduling and undertakings (Modules C and D)
Owner: Sanjay Suriya   Date: 2026-10-27   Tag: stage-6-done

## Done
- EVC queue: files that are IN_PROGRESS, EVC-ready, at an EVC entry stage and have no PLANNED or COMPLETED visit (scoped)
- EVC list/calendar data with a computed `display` value: DONE, LATE (planned date before today), DUE_SOON (within 7 days), PLANNED, CANCELLED
- Schedule an EVC visit: minimum-notice rule from the `evc_rules` table (working days), planned date must be a working day, creates the visit and the EVC obligation, moves the file from "EVC scheduling" to the next stage, all in ONE transaction
- Complete an EVC visit: records actual date and committee notes, closes the EVC obligation, moves the file to the next stage, ONE transaction
- Undertakings: staff records a promise (undertaking + UNDERTAKING obligation + IN_APP notification per active institution user)
- Proofs: the institution uploads PDF, JPG or PNG (max 10 MB, real type checked by file signature, random file name, stored under UPLOAD_DIR/proofs); staff views the file through a scope-checked endpoint; staff accepts or rejects. Accept closes the undertaking and obligation. Reject reopens both with a new due date and notifies the institution
- EVC reminder alert rules at 7, 3 and 1 days before (data only; the daily job comes in Stage 7)
- Shared `advanceStage` function extracted from `completeStage` (Stage 5 behaviour unchanged)
- Frontend: EVC page (queue with Schedule visit form, month calendar and list toggle, Record visit form), Promises page for institutions (list, due dates, state chips, upload), verification page for staff (accept or reject), "Record undertaking" form and lists of undertakings and EVC visits on the application detail page
- Tests: EVC (queue, scope, minimum notice, non-working day, double schedule, obligation and stage move, complete, late display, rollback of both writes), undertakings (record, upload limits and fake extensions, accept, reject and reopen, second upload 409, cross-institution blocked, rollback of every write, file removed on failure), seed and upload-folder tests

## Done test result
- A scrutinised file appears in the EVC queue, gets a date, gets an EVC obligation (OPEN, alert level 0) and the 7/3/1-day alert rules exist, and shows LATE when the planned date passes: passed as API tests (tests/evc.test.js)
- A promise is created, proof uploaded, accepted and closed; a rejected proof reopens it: passed as API tests (tests/undertakings.test.js)
- npm test in server/: <N> passed (fill in the final number from the "Tests" line)
- npm run seed:check: DEMO NUMBERS OK; npm run lint: clean (server and client); npm run build in client/: ok
- Fresh clone plus .env plus npm run reset plus npm test: <fill in: passed>
- Walked through by hand in the UI (officer1 and institution1): <fill in: yes>

## How to run
- After pulling: npm install in server/ and client/, then npm run reset (new migration `evc_rules`)
- No new env vars. UPLOAD_DIR (already in .env.example, default ./uploads) is resolved relative to server/; proofs go to UPLOAD_DIR/proofs, created on first use. `uploads/` is in .gitignore
- Upload tests write to a temp folder and delete it, so your real uploads/ folder is never touched

## Endpoints added (also in docs/api-contract.md)
- GET /api/evc/queue: OFFICER, SUPERVISOR, HEAD_OFFICE: files waiting for a visit date
- GET /api/evc: staff: visits with `display`; filters from, to, status, applicationId, page, pageSize
- POST /api/evc/:applicationId/schedule: staff (scoped, stage owner rule): schedule a visit
- POST /api/evc/:visitId/complete: staff (scoped, stage owner rule): record the visit
- POST /api/applications/:id/undertakings: staff (scoped): record an undertaking
- GET /api/undertakings: all roles (scoped; institution sees its own): list with proofs; filters status, applicationId
- POST /api/undertakings/:id/proofs: INSTITUTION (own institution): upload proof (multipart field `file`)
- GET /api/proofs/:id/file: all roles (scoped; institution only its own): streams the file
- POST /api/proofs/:id/verify: staff (scoped): ACCEPTED, or REJECTED with remarks and newDueDate

## Tables / enums / services added or changed
- evc_rules (id, min_notice_days, active): one active row, 7 working days (placeholder). Model `EvcRule`, migration `evc_rules`, seed in prisma/seed/evcRules.js
- alert_rules: EVC now has REMINDER_SENT rules at 7, 3 and 1 days before for EMAIL and IN_APP (was one rule at 3). Seed: LEAD_DAYS in prisma/seed/data.js is now an array per kind
- services/stageService.js: new `advanceStage(tx, {...})`; `completeStage` now calls it
- services/evcService.js: listQueue, listVisits, scheduleVisit, completeVisit, displayStatus
- services/undertakingService.js: recordUndertaking, listUndertakings, uploadProof, getProofFile, verifyProof
- services/proofFiles.js: detectFileType (signature check), writeProofFile, removeProofFile
- services/notifyService.js: notifyInstitutionUsers(db, institutionId, { subject, body, obligationId })
- utils/uploadDir.js: getUploadRoot, getProofsDir, proofFilePath (accepts only our generated names)
- middleware/uploadProof.js (multer memory storage, 10 MB, .pdf/.jpg/.jpeg/.png names)
- routes: /api/evc, /api/undertakings, /api/proofs, and POST /api/applications/:id/undertakings
- Client: pages Evc.jsx, Undertakings.jsx; components EvcCalendar.jsx, FileExtras.jsx; utils/proofUrl.js; StatusChip has colours for PLANNED, DUE_SOON, LATE, COMPLETED, CANCELLED, PENDING, SUBMITTED, VERIFIED, ACCEPTED; App.jsx routes /evc and /undertakings; Sidebar gives supervisors and head office an Undertakings link

## How EVC and UNDERTAKING obligations are created (for Stage 7)
- EVC: created in scheduleVisit. kind EVC, ref_id = evc_visits.id, owner = the file's assigned officer, due_date = planned date, state OPEN, last_alert_level 0. Closed (state DONE, closed_on set) in completeVisit
- UNDERTAKING: created in recordUndertaking. kind UNDERTAKING, ref_id = undertakings.id, owner = the file's assigned officer, due_date = the promised date, state OPEN, last_alert_level 0. Closed (DONE) when the proof is accepted. On a rejected proof the SAME obligation is reopened: state OPEN, new due_date, last_alert_level reset to 0, closed_on cleared
- Both look like STAGE obligations to the daily job. Find the owning record with kind plus ref_id
- EVC reminders: alert_rules rows for kind EVC, level REMINDER_SENT, days_before 7, 3 and 1, recipient OWNER, channels EMAIL and IN_APP. These three rules share the same level, so Stage 7's `last_alert_level` must tell them apart (for example by using days_before, or one alert level number per rule). Decide this before writing the ladder
- Late EVC visits: Stage 6 only SHOWS LATE in the UI (PLANNED and planned date before today). Moving the obligation to OVERDUE and onward is the Stage 7 job

## Stage movement on schedule and complete
- Schedule: the file must be IN_PROGRESS at a stage with is_evc_entry. The entry stage ("EVC scheduling") is completed and the file moves to the next stage ("EVC visit"). Audit EVC_SCHEDULED
- Complete: the file must be at the stage right after the EVC entry stage. That stage ("EVC visit") is completed and the file moves to the next stage ("EVC report review"). Audit EVC_COMPLETED
- No stage names are used in code; both use route_stages.is_evc_entry and order_no through `advanceStage`

## Proof upload rules and where files live
- Institution only, own institution only. Allowed: PDF (%PDF-), JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), detected from the file bytes. The file name and browser type are not trusted. File names must still end in .pdf, .jpg, .jpeg or .png
- Max 10 MB. The file is held in memory, checked, then written to UPLOAD_DIR/proofs under `<uuid>.<detected ext>`. proofs.file_path stores only that name, never a folder path
- If the database part fails after the file was written, the file is deleted again
- Files are never served statically. GET /api/proofs/:id/file checks scope, then streams with nosniff and no-store
- One open proof at a time: while the undertaking is SUBMITTED a new upload gives 409 ALREADY_SUBMITTED. Rejected proofs stay as history

## Audit action names
- EVC_SCHEDULED, EVC_COMPLETED (entity application); UNDERTAKING_RECORDED (entity undertaking); PROOF_UPLOADED, PROOF_VERIFIED (entity proof)

## Deviations from the plan
- Undertakings may be recorded on files that are IN_PROGRESS or APPROVED (the plan said IN_PROGRESS only). Reason: the demo flow is "approve with an undertaking". REJECTED and CLOSED files are refused (409 APPLICATION_CLOSED)
- Rejecting a proof requires both remarks and a new due date; accepting must not carry a new due date (400)
- Extra filter `applicationId` on GET /api/evc, used by the application detail page
- Who may schedule or record an EVC visit follows the stage owner rule (canCompleteStage), on top of the role list and the data scope
- Completing a visit also requires the file to be at the stage right after the EVC entry stage (409 WRONG_STAGE)
- Notifications are created only for institution users (IN_APP, sent_on set at creation): when an undertaking is recorded and when a proof is rejected. Staff get no notification on upload; the verification page lists what is waiting
- The three EVC reminder rules share one alert level (see above)
- The proof file name check also requires a PDF/JPG/PNG file name (INVALID_FILE_TYPE) before the signature check (INVALID_FILE)
- Sidebar: supervisors and head office also get an Undertakings link (verification)
- Vitest and the seed are unchanged except the files listed above

## Known issues / not done
- Rescheduling and cancelling an EVC visit are not built (status CANCELLED exists but nothing sets it)
- The EVC obligation is not moved to OVERDUE or escalated yet (Stage 7). The UI shows LATE only
- The undertaking status REJECTED exists in the enum but is not used: a rejected proof sets the undertaking back to PENDING
- Proofs are supported for undertakings only (owner_type UNDERTAKING). Stage 7 must add DOCUMENT proofs and may reuse proofFiles.js and uploadDir.js
- Minimum notice is 7 working days (placeholder) and is not editable in the UI until the Stage 8 settings screen
- Notification rows for the institution are created, but nothing shows them yet (bell and notification page are Stage 8)
- Uploaded files live on the server's local disk (not suitable for a host with a temporary disk; check this in Stage 10B)
- The calendar shows one month at a time and at most 2 visits per day cell plus a count
- No client tests; the browser walkthrough was done by hand
- Stage names, max_days and the 7-day notice are still placeholders, not checked against the handbook

## Next owner: read these first
- server/src/services/stageService.js (`advanceStage`), evcService.js and undertakingService.js (how EVC and UNDERTAKING obligations are created and closed)
- server/prisma/seed/data.js (`buildAlertRules`, LEAD_DAYS) and the alert_rules table for the 7/3/1-day EVC reminders
- server/src/services/proofFiles.js, utils/uploadDir.js, middleware/uploadProof.js (reuse these for DOCUMENT proofs in Stage 7)
- server/src/services/notifyService.js (institution notifications)
- server/tests/evc.test.js and undertakings.test.js (test patterns, including the temp UPLOAD_DIR and rollback spies on `audit.logAction`, `scheduleService.resolveOwners` and `notifyService.notifyInstitutionUsers`; services call these through the module object so tests can spy on them)
- RULES that still apply: every application query uses where: { AND: [{ id }, scopeApplications(req.user)] }; every write calls logAction inside its transaction; every endpoint gets a row in docs/api-contract.md; client component files export only components
-