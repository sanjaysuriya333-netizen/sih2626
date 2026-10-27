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
| GET | /api/health | any (public) | none | `{ "data": { "status": "ok" } }` |
| POST | /api/auth/login | public | `{ "email": "", "password": "" }` | `{ "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } }` and sets the `token` cookie. Errors: 400, 401 `INVALID_CREDENTIALS` or `ACCOUNT_LOCKED`, 429 `RATE_LIMITED` |
| POST | /api/auth/logout | any (no login needed) | none | `{ "data": { "loggedOut": true } }` and clears the cookie |
| GET | /api/auth/me | any logged-in role | none | `{ "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } }` |
| POST | /api/applications | OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION | `{ "institutionId"?, "newOrExisting": "NEW\|EXISTING", "programmeLevel": "UG\|PG\|DIPLOMA", "submittedOn"?: "YYYY-MM-DD", "assignedOfficerId"? }`. Officer: assigned to self, institutionId required. Supervisor: assignedOfficerId required, must be in own team. Head office: assignedOfficerId required. Institution: institutionId forced to own, officer auto-assigned (fewest open files in the region) | 201 `{ "data": { "id", "appCode", "status", "routeId", "routeName", "currentStageId", "assignedOfficerId", "institutionId", "submittedOn", "stages": [{ "orderNo", "stageName", "ownerRole", "dueDate" }] } }`. Errors: 400, 401, 403, 404, 409 `NO_OFFICER_AVAILABLE` |
| GET | /api/applications | any logged-in role (rows limited by data scope) | query: `stage` (stage name), `status`, `officerId`, `region`, `dueFrom`, `dueTo` (YYYY-MM-DD, due date of the current stage, inclusive), `page` (default 1), `pageSize` (default 20, max 100) | 200 `{ "data": [{ "id", "appCode", "status", "institution": { "id", "name", "region" }, "routeName", "currentStage": { "id", "stageName", "ownerRole" }, "officer": { "id", "name" }, "submittedOn", "evcReadyOn", "nextDueDate", "obligationState", "canComplete" }], "meta": { "page", "pageSize", "total" } }`, newest first. 400 on bad filters |
| GET | /api/applications/filters | any logged-in role | none | 200 `{ "data": { "stages": [], "regions": [], "officers": [{ "id", "name" }], "institutions": [{ "id", "name", "region" }], "statuses": [] } }` (officers limited to the caller's scope; `institutions` empty for the `INSTITUTION` role) |
| GET | /api/applications/:id | any logged-in role (404 if outside scope) | none | 200 `{ "data": { "id", "appCode", "status", "newOrExisting", "programmeLevel", "submittedOn", "closedOn", "evcReadyOn", "institution", "route": { "id", "name" }, "officer", "currentStage", "isLastStage", "canComplete", "timeline": [{ "stageId", "orderNo", "stageName", "ownerRole", "maxDays", "state": "DONE\|CURRENT\|UPCOMING", "enteredOn", "completedOn", "completedBy", "dueDate", "obligationState" }] } }` |
| POST | /api/applications/import | OFFICER, SUPERVISOR, HEAD_OFFICE | multipart/form-data, one file in field `file` (.csv, text, max 2 MB, max 200 rows). Columns (header row, case-insensitive): `institutionId`, `newOrExisting` (NEW\|EXISTING), `programmeLevel` (UG\|PG\|DIPLOMA), `submittedOn` (optional YYYY-MM-DD), `assignedOfficerEmail` (officer: empty or own email; supervisor: required, own team; head office: required). Row 1 is the header | 200 `{ "data": { "total", "imported", "failed", "errors": [{ "row", "field", "message" }], "created": [{ "row", "id", "appCode" }] } }`. Valid rows are imported even if others fail. 400 `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `FILE_REQUIRED`, `INVALID_FILE`, `INVALID_CSV`, `EMPTY_FILE`, `MISSING_COLUMNS`, `TOO_MANY_ROWS`; 401; 403 |
| GET | /api/evc/queue | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | query `page`, `pageSize` | `data: [{ id, appCode, institutionName, officerName, stageName, evcReadyOn }], meta` |
| GET | /api/evc | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | query `from`, `to` (YYYY-MM-DD), `status` (PLANNED, COMPLETED, CANCELLED), `page`, `pageSize` (max 200) | `data: [{ id, applicationId, appCode, institutionName, officerName, plannedDate, actualDate, status, committeeNotes, display }]` where display is `DONE`, `LATE`, `DUE_SOON`, `PLANNED` or `CANCELLED`; `meta` |
| POST | /api/evc/:applicationId/schedule | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped, stage owner rule) | `{ "plannedDate": "YYYY-MM-DD" }` | 201 `data: { visit: { id, applicationId, plannedDate, status }, application: { id, appCode, status, currentStageId, nextStage, evcReady, closedOn } }`. Errors: 400 `MIN_NOTICE`, `NOT_WORKING_DAY`; 404; 409 `NOT_EVC_READY`, `ALREADY_SCHEDULED`, `CONFLICT` |
| POST | /api/evc/:visitId/complete | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped, stage owner rule) | `{ "actualDate"?: "YYYY-MM-DD", "committeeNotes": "text" }` | 200 `data: { visit: { id, applicationId, actualDate, status, committeeNotes }, application: {...} }`. Errors: 400 (future date, missing notes); 404; 409 `NOT_PLANNED`, `WRONG_STAGE` |
| POST | /api/applications/:id/undertakings | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | `{ "description": "text", "dueDate": "YYYY-MM-DD" }` (today or later; application must be `IN_PROGRESS` or `APPROVED`) | 201 `data: { id, applicationId, description, dueDate, status, obligationId }`. Errors: 400; 403; 404; 409 `APPLICATION_CLOSED`. Creates an UNDERTAKING obligation and IN_APP notifications for the institution's users |
| GET | /api/undertakings | all roles (scoped through the application; institutions see their own) | query `status` (PENDING, SUBMITTED, VERIFIED, REJECTED), `applicationId`, `page`, `pageSize` (max 200) | `data: [{ id, applicationId, appCode, institutionName, description, dueDate, status, late, verifiedBy, closedOn, proofs: [{ id, uploadedOn, verifiedStatus, remarks }] }], meta` |
| POST | /api/undertakings/:id/proofs | INSTITUTION (own institution only) | `multipart/form-data`, one file in field `file` (PDF, JPG or PNG, max 10 MB, real type checked) | 201 `data: { proof: { id, verifiedStatus, uploadedOn }, undertaking: { id, status } }`. Errors: 400 `INVALID_FILE_TYPE`, `INVALID_FILE`, `FILE_TOO_LARGE`, `FILE_REQUIRED`, `INVALID_UPLOAD`; 401; 403; 404; 409 `ALREADY_SUBMITTED`, `NOT_OPEN` |
| GET | /api/proofs/:id/file | all roles (scoped; institution only its own) | none | the file bytes with `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. 404 if out of scope or missing |
| POST | /api/proofs/:id/verify | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | `{ "status": "ACCEPTED" }` or `{ "status": "REJECTED", "remarks": "text", "newDueDate": "YYYY-MM-DD" }` | 200 `data: { proof: { id, verifiedStatus, remarks }, undertaking: { id, status, dueDate, closedOn } }`. ACCEPTED closes the undertaking and obligation. REJECTED reopens both with the new due date and notifies the institution. Errors: 400; 403; 404; 409 `ALREADY_DECIDED`, `NOT_SUBMITTED` |
| GET | /api/evc | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | query `applicationId`, `from`, `to` (YYYY-MM-DD), `status` (PLANNED, COMPLETED, CANCELLED), `page`, `pageSize` (max 200) | `data: [{ id, applicationId, appCode, institutionName, officerName, plannedDate, actualDate, status, committeeNotes, display }]` where display is `DONE`, `LATE`, `DUE_SOON`, `PLANNED` or `CANCELLED`; `meta` |
| POST | `/api/documents` | all roles (scoped; institution only own files) | `{ "applicationId", "docType", "validUntil": "YYYY-MM-DD" }` (today or later) | 201 data: { id, applicationId, docType, validUntil, status, obligationId }. Errors: 400; 401; 404; 409 ALREADY_EXISTS, NO_OFFICER |
| GET | `/api/documents` | all roles (scoped) | query status (VALID, EXPIRED, REPLACED), applicationId, expiringWithinDays (1 to 730; VALID and EXPIRED documents whose expiry is within that many calendar days), page, pageSize (max 200) | data: [{ id, applicationId, appCode, institutionName, docType, validUntil, status, daysToExpiry, obligationState, replacedById, closedOn, renewal: { proofId, uploadedOn, newValidUntil } or null, proofs: [{ id, uploadedOn, verifiedStatus, remarks }] }], meta. Sorted by expiry |
| POST | `/api/documents/:id/renew` | INSTITUTION (own institution only) | multipart/form-data: text field newValidUntil (YYYY-MM-DD, later than the current expiry and in the future), file in field file (PDF, JPG or PNG, max 10 MB, real type checked) | 201 data: { proof: { id, verifiedStatus, uploadedOn }, document: { id, status, renewalValidUntil } }. Errors: 400 VALIDATION_ERROR, INVALID_FILE_TYPE, INVALID_FILE, FILE_TOO_LARGE, FILE_REQUIRED; 401; 403; 404; 409 RENEWAL_PENDING, ALREADY_REPLACED |
| POST | `/api/documents/:id/renewal-decision` | OFFICER, SUPERVISOR, HEAD_OFFICE (scoped) | { "status": "ACCEPTED", "remarks"? } or { "status": "REJECTED", "remarks": "text" } | 200 data: { document, newDocument? (accepted only), proof }. Accepted: old document REPLACED, obligation DONE, new document and obligation created. Errors: 400; 403; 404; 409 NO_PENDING_RENEWAL |
| POST | /api/admin/run-daily-check | HEAD_OFFICE | query asOf=YYYY-MM-DD (optional, default today in IST) | 200 data: { asOf, checked, fired, skipped, failed, byKind, byLevel, transitions: [{ obligationId, kind, from, to, step, notifications }] (first 100), failures }. Writes one DAILY_CHECK_RUN audit row. Errors: 400; 401; 403 |
| GET | /api/documents/expiring | OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION | query days=30 (optional) | 200 data: [ { id, applicationNo, docType, validUntil, status, daysRemaining } ]. Errors: 401, 403 |
| POST | /api/documents/renew | INSTITUTION | multipart/form-data: documentId, file, newValidUntil | 201 data: { renewalRequestId, status: "PENDING" }. Errors: 400, 401, 403, 404 |
| POST | /api/documents/renewals/:id/confirm | OFFICER, SUPERVISOR, HEAD_OFFICE | body: { action: "ACCEPT" | "REJECT", comment? } | 200 data: { renewalRequestId, status, documentId }. Errors: 400, 401, 403, 404 |
| POST | /api/admin/run-daily-check | HEAD_OFFICE | query asOf=YYYY-MM-DD (optional, default today in IST) | 200 data: { asOf, checked, fired, skipped, failed, byKind, byLevel, transitions: [{ obligationId, kind, from, to, step, notifications }] (first 100), failures }. Writes one DAILY_CHECK_RUN audit row. Errors: 400, 401, 403 |
| GET | /api/admin/daily-check-runs | HEAD_OFFICE | query limit=10, page=1 | 200 data: [ { id, runAt, asOf, checked, fired, skipped, failed, transitions } ]. Errors: 401, 403 |