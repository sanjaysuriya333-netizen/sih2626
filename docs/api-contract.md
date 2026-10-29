# API contract

Base path: `/api`. Every new endpoint adds a row below in the same commit.

## Response shapes

Success:
```json
{ "data": {}, "meta": { "page": 1, "pageSize": 20, "total": 0 } }
```
`meta` appears on list endpoints only.

Error:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [] } }
```

## Status codes

| Code | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 400 | Validation error |
| 401 | Not logged in |
| 403 | Wrong role or not the owner |
| 404 | Not found |
| 409 | Conflict |
| 429 | Rate limited (login) |

## Auth contract

Cookie `token` (HTTP-only, same-site). After the `authenticate` middleware: `req.user = { id, role, region, institutionId, supervisorId }`.

## Endpoints

| Method | Path | Role allowed |  JSON | Response JSON |
| --- | --- | --- | --- | --- |
| GET | /api/health | any (public) | none | { "data": { "status": "ok" } } |
| POST | /api/auth/login | public | { "email": "", "password": "" } | { "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } } and sets the token cookie. Errors: 400, 401 INVALID_CREDENTIALS or ACCOUNT_LOCKED, 429 RATE_LIMITED |
| POST | /api/auth/logout | any (no login needed) | none | { "data": { "loggedOut": true } } and clears the cookie |
| GET | /api/auth/me | any logged-in role | none | { "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } } |
| POST | /api/applications | OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION | { "institutionId"?, "newOrExisting": "NEW|EXISTING", "programmeLevel": "UG|PG|DIPLOMA", "submittedOn"?: "YYYY-MM-DD", "assignedOfficerId"? }. Officer: assigned to self, institutionId required. Supervisor: assignedOfficerId required, must be in own team. Head office: assignedOfficerId required. Institution: institutionId forced to own, officer auto-assigned (fewest open files in the region) | 201 { "data": { "id", "appCode", "status", "routeId", "routeName", "currentStageId", "assignedOfficerId", "institutionId", "submittedOn", "stages": [{ "orderNo", "stageName", "ownerRole", "dueDate" }] } }. Errors: 400, 401, 403, 404, 409 NO_OFFICER_AVAILABLE |
| GET | /api/applications | any logged-in role (rows limited by data scope) | query: stage (stage name), status, officerId, region, dueFrom, dueTo (YYYY-MM-DD, due date of the current stage, inclusive), page (default 1), pageSize (default 20, max 100) | 200 { "data": [{ "id", "appCode", "status", "institution": { "id", "name", "region" }, "routeName", "currentStage": { "id", "stageName", "ownerRole" }, "officer": { "id", "name" }, "submittedOn", "evcReadyOn", "nextDueDate", "obligationState", "canComplete" }], "meta": { "page", "pageSize", "total" } }, newest first. 400 on bad filters |
| GET | /api/applications/filters | any logged-in role | none | 200 { "data": { "stages": [], "regions": [], "officers": [{ "id", "name" }], "institutions": [{ "id", "name", "region" }], "statuses": [] } } (officers limited to the caller's scope; institutions empty for the INSTITUTION role) |
| GET | /api/applications/:id | any logged-in role (404 if outside scope) | none | 200 { "data": { "id", "appCode", "status", "newOrExisting", "programmeLevel", "submittedOn", "closedOn", "evcReadyOn", "institution", "route": { "id", "name" }, "officer", "currentStage", "isLastStage", "canComplete", "timeline": [{ "stageId", "orderNo", "stageName", "ownerRole", "maxDays", "state": "DONE|CURRENT|UPCOMING", "enteredOn", "completedOn", "completedBy", "dueDate", "obligationState" }] } } |
| POST | /api/applications/import | OFFICER, SUPERVISOR, HEAD_OFFICE | multipart/form-data, one file in field file (.csv, text, max 2 MB, max 200 rows). Columns (header row, case-insensitive): institutionId, newOrExisting (NEW|EXISTING), programmeLevel (UG|PG|DIPLOMA), submittedOn (optional YYYY-MM-DD), assignedOfficerEmail (officer: empty or own email; supervisor: required, own team; head office: required). Row 1 is the header | 200 { "data": { "total", "imported", "failed", "errors": [{ "row", "field", "message" }], "created": [{ "row", "id", "appCode" }] } }. Valid rows are imported even if others fail. 400 INVALID_FILE_TYPE, FILE_TOO_LARGE, FILE_REQUIRED, INVALID_FILE, INVALID_CSV, EMPTY_FILE, MISSING_COLUMNS, TOO_MANY_ROWS; 401; 403 |
| GET | /api/evc/queue | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | query page, pageSize | data: [{ id, appCode, institutionName, officerName, stageName, evcReadyOn }], meta |
| POST | /api/evc/:applicationId/schedule | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped, stage owner rule) | { "plannedDate": "YYYY-MM-DD" } | 201 data: { visit: { id, applicationId, plannedDate, status }, application: { id, appCode, status, currentStageId, nextStage, evcReady, closedOn } }. Errors: 400 MIN_NOTICE, NOT_WORKING_DAY; 404; 409 NOT_EVC_READY, ALREADY_SCHEDULED, CONFLICT |
| POST | /api/evc/:visitId/complete | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped, stage owner rule) | { "actualDate"?: "YYYY-MM-DD", "committeeNotes": "text" } | 200 data: { visit: { id, applicationId, actualDate, status, committeeNotes }, application: {...} }. Errors: 400 (future date, missing notes); 404; 409 NOT_PLANNED, WRONG_STAGE |
| POST | /api/applications/:id/undertakings | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | { "description": "text", "dueDate": "YYYY-MM-DD" } (today or later; application must be IN_PROGRESS or APPROVED) | 201 data: { id, applicationId, description, dueDate, status, obligationId }. Errors: 400; 403; 404; 409 APPLICATION_CLOSED. Creates an UNDERTAKING obligation and IN_APP notifications for the institution's users |
| GET | /api/undertakings | all roles (scoped through the application; institutions see their own) | query status (PENDING, SUBMITTED, VERIFIED, REJECTED), applicationId, page, pageSize (max 200) | data: [{ id, applicationId, appCode, institutionName, description, dueDate, status, late, verifiedBy, closedOn, proofs: [{ id, uploadedOn, verifiedStatus, remarks }] }], meta |
| POST | /api/undertakings/:id/proofs | INSTITUTION (own institution only) | multipart/form-data, one file in field file (PDF, JPG or PNG, max 10 MB, real type checked) | 201 data: { proof: { id, verifiedStatus, uploadedOn }, undertaking: { id, status } }. Errors: 400 INVALID_FILE_TYPE, INVALID_FILE, FILE_TOO_LARGE, FILE_REQUIRED, INVALID_UPLOAD; 401; 403; 404; 409 ALREADY_SUBMITTED, NOT_OPEN |
| GET | /api/proofs/:id/file | all roles (scoped; institution only its own) | none | the file bytes with Content-Type, X-Content-Type-Options: nosniff, Cache-Control: private, no-store. 404 if out of scope or missing |
| POST | /api/proofs/:id/verify | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | { "status": "ACCEPTED" } or { "status": "REJECTED", "remarks": "text", "newDueDate": "YYYY-MM-DD" } | 200 data: { proof: { id, verifiedStatus, remarks }, undertaking: { id, status, dueDate, closedOn } }. ACCEPTED closes the undertaking and obligation. REJECTED reopens both with the new due date and notifies the institution. Errors: 400; 403; 404; 409 ALREADY_DECIDED, NOT_SUBMITTED |
| GET | /api/evc | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | query applicationId, from, to (YYYY-MM-DD), status (PLANNED, COMPLETED, CANCELLED), page, pageSize (max 200) | data: [{ id, applicationId, appCode, institutionName, officerName, plannedDate, actualDate, status, committeeNotes, display }], meta where display is DONE, LATE, DUE_SOON, PLANNED or CANCELLED. Sorted by plannedDate |
| POST | /api/documents | all roles (scoped; institution only own files) | { "applicationId", "docType", "validUntil": "YYYY-MM-DD" } (today or later) | 201 data: { id, applicationId, docType, validUntil, status, obligationId }. Errors: 400; 401; 404; 409 ALREADY_EXISTS, NO_OFFICER |
| GET | /api/documents | all roles (scoped) | query status (VALID, EXPIRED, REPLACED), applicationId, expiringWithinDays (1 to 730; VALID and EXPIRED documents whose expiry is within that many calendar days), page, pageSize (max 200) | data: [{ id, applicationId, appCode, institutionName, docType, validUntil, status, daysToExpiry, obligationState, replacedById, closedOn, renewal: { proofId, uploadedOn, newValidUntil } or null, proofs: [{ id, uploadedOn, verifiedStatus, remarks }] }], meta. Sorted by expiry |
| POST | /api/documents/:id/renew | INSTITUTION (own institution only) | multipart/form-data: text field newValidUntil (YYYY-MM-DD, later than the current expiry and in the future), file in field file (PDF, JPG or PNG, max 10 MB, real type checked) | 201 data: { proof: { id, verifiedStatus, uploadedOn }, document: { id, status, renewalValidUntil } }. Errors: 400 VALIDATION_ERROR, INVALID_FILE_TYPE, INVALID_FILE, FILE_TOO_LARGE, FILE_REQUIRED; 401; 403; 404; 409 RENEWAL_PENDING, ALREADY_REPLACED |
| POST | /api/documents/:id/renewal-decision | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | { "status": "ACCEPTED", "remarks"? } or { "status": "REJECTED", "remarks": "text" } | 200 data: { document, newDocument? (accepted only), proof }. Accepted: old document REPLACED, obligation DONE, new document and obligation created. Errors: 400; 403; 404; 409 NO_PENDING_RENEWAL |
| POST | /api/admin/run-daily-check | HEAD_OFFICE | query asOf=YYYY-MM-DD (optional, default today in IST) | 200 data: { asOf, checked, fired, skipped, failed, byKind, byLevel, transitions: [{ obligationId, kind, from, to, step, notifications }] (first 100), failures }. Writes one DAILY_CHECK_RUN audit row. Errors: 400; 401; 403 |
| GET | /api/notifications | all roles (own rows only) | query unread (true/false), page, pageSize (max 100) | data: [{ id, subject, body, sentOn, readOn, obligationId, applicationId, appCode }], meta. IN_APP rows only, newest first |
| GET | /api/notifications/unread-count | all roles (own rows only) | none | data: { unread } |
| POST | /api/notifications/:id/read | all roles (own rows only) | none | 200 data: { id, readOn }. Safe to repeat. 404 if the row is not yours |
| POST | /api/notifications/read-all | all roles (own rows only) | none | 200 data: { updated } |
| GET | /api/settings | HEAD_OFFICE | none | data: { kinds: [{ kind, steps: [{ step, daysBefore, level, rules: [{ id, channel, recipientRole, active }] }] }], evcMinNoticeDays } |
| PUT | /api/settings/alert-steps/:kind | HEAD_OFFICE | { "daysBefore": [2, 0, -1, -3, -7] }: the new days_before of EVERY step of that kind, largest first. Same count as now, strictly descending, the DUE_TODAY step stays 0 | 200 data: { kind, changed, daysBefore }. Both channels of a step change together. 400 VALIDATION_ERROR; 401; 403. Applies from the next daily run. Audit SETTINGS_ALERT_STEPS_UPDATED |
| PATCH | /api/settings/alert-rules/:id | HEAD_OFFICE | { "active"?, "channel"?: "EMAIL|IN_APP|SMS", "recipientRole"?: "OWNER|SUPERVISOR|HEAD_OFFICE" } (at least one) | 200 data: { id, kind, daysBefore, active, channel, recipientRole }. 404; 409 LAST_ACTIVE_RULE, WOULD_ADD_STEP. Audit SETTINGS_ALERT_RULE_UPDATED |
| PATCH | /api/settings/evc-min-notice | HEAD_OFFICE | { "minNoticeDays": 0 to 30 } (working days) | 200 data: { id, minNoticeDays }. Audit SETTINGS_EVC_MIN_NOTICE_UPDATED |
| GET | /api/email-preview | HEAD_OFFICE | query page, pageSize (max 100) | data: [{ id, to: { name, email }, subject, body, sentOn, obligationId, applicationId, appCode }], meta: { page, pageSize, total, mode: "smtp|preview" }. EMAIL notification rows, newest first. Read only |
| GET | /api/dashboard/summary | all roles (scoped) | query region, stage (current stage name), dueFrom, dueTo (YYYY-MM-DD, due date of the current stage), all optional | data: { asOf, inProgress, dueToday, dueThisWeek, overdue, escalated, reported, byStatus: { STATUS: n }, byKind: { STAGE|EVC|UNDERTAKING|DOCUMENT: { STATE: n } } }. dueThisWeek = today to today+6 (IST), STAGE obligations of the stage the file is at, in OPEN, REMINDER_SENT or DUE_TODAY. overdue, escalated, reported count open obligations of all kinds in that state |
| GET | /api/dashboard/breakdown | all roles (scoped) | query by (status, stage, region, institution, officer; required) plus the same filters | data: [{ key, label, total, overdue, escalated }], largest first. Everything except by=status counts IN_PROGRESS files only. overdue and escalated (ESCALATED or REPORTED) come from the file's current stage obligation |
| GET | /api/dashboard/ageing | all roles (scoped) | same filters | data: { buckets: [{ label, count }], total }. IN_PROGRESS files by calendar days since submitted_on: 0-7, 8-14, 15-30, 31-60, 61+ |
| GET | /api/dashboard/stage-durations | all roles (scoped) | same filters | data: [{ stageName, count, avgDays }] in route order. Average calendar days from entered_on to completed_on over closed stage_history rows |
| GET | /api/reports/:type | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | type = pending, overdue or compliance. Query page, pageSize (max 100), region, stage (current stage name), dueFrom, dueTo (YYYY-MM-DD). pending: dates filter the current stage's due date. overdue: dates filter the item's own due date. compliance: dates are ignored and pages are FILES (each file brings all its events) | data: [row], meta: { page, pageSize, total, columns: [{ key, label, type? }] }. pending row: { appCode, institution, region, route, stage, officer, submittedOn, dueDate, daysToDue, state }. overdue row (open obligations of any kind in OVERDUE, ESCALATED or REPORTED): { kind, appCode, institution, region, item, owner, dueDate, daysOverdue, state }. compliance row: { appCode, institution, region, type: STAGE|AUDIT|ALERT|UNDERTAKING|EVC|DOCUMENT, event, at, by, detail }. 400 on a bad type, date or filter; 401; 403 |
| GET | /api/reports/:type/export | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | same filters, no paging | CSV file (UTF-8 with BOM, Content-Disposition: attachment), all matching rows. Text cells starting with =, +, - or @ get a leading '. Writes one audit row REPORT_EXPORTED (entity report, after: report, filters, rows). 400 TOO_MANY_ROWS for a compliance export over 1000 files; 401; 403 |