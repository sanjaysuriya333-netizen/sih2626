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

| Method | Path | Role allowed | Request JSON | Response JSON |
| --- | --- | --- | --- | --- |
| GET | /api/health | any (public) | none | `{ "data": { "status": "ok" } }` |
| POST | /api/auth/login | public | `{ "email": "", "password": "" }` | `{ "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } }` and sets the `token` cookie. Errors: 400, 401 `INVALID_CREDENTIALS` or `ACCOUNT_LOCKED`, 429 `RATE_LIMITED` |
| POST | /api/auth/logout | any (no login needed) | none | `{ "data": { "loggedOut": true } }` and clears the cookie |
| GET | /api/auth/me | any logged-in role | none | `{ "data": { "id", "name", "email", "role", "region", "institutionId", "supervisorId" } }` |
| POST | /api/applications | OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION | `{ "institutionId"?, "newOrExisting": "NEW\|EXISTING", "programmeLevel": "UG\|PG\|DIPLOMA", "submittedOn"?: "YYYY-MM-DD", "assignedOfficerId"? }`. Officer: assigned to self, institutionId required. Supervisor: assignedOfficerId required, must be in own team. Head office: assignedOfficerId required. Institution: institutionId forced to own, officer auto-assigned (fewest open files in the region) | 201 `{ "data": { "id", "appCode", "status", "routeId", "routeName", "currentStageId", "assignedOfficerId", "institutionId", "submittedOn", "stages": [{ "orderNo", "stageName", "ownerRole", "dueDate" }] } }`. Errors: 400, 401, 403, 404, 409 `NO_OFFICER_AVAILABLE` |
| GET | /api/applications | any logged-in role (rows limited by data scope) | query: `stage` (stage name), `status`, `officerId`, `region`, `dueFrom`, `dueTo` (YYYY-MM-DD, due date of the current stage, inclusive), `page` (default 1), `pageSize` (default 20, max 100) | 200 `{ "data": [{ "id", "appCode", "status", "institution": { "id", "name", "region" }, "routeName", "currentStage": { "id", "stageName", "ownerRole" }, "officer": { "id", "name" }, "submittedOn", "evcReadyOn", "nextDueDate", "obligationState", "canComplete" }], "meta": { "page", "pageSize", "total" } }`, newest first. 400 on bad filters |
| GET | /api/applications/filters | any logged-in role | none | 200 `{ "data": { "stages": [], "regions": [], "officers": [{ "id", "name" }], "statuses": [] } }` (officers limited to the caller's scope) |
| GET | /api/applications/:id | any logged-in role (404 if outside scope) | none | 200 `{ "data": { "id", "appCode", "status", "newOrExisting", "programmeLevel", "submittedOn", "closedOn", "evcReadyOn", "institution", "route": { "id", "name" }, "officer", "currentStage", "isLastStage", "canComplete", "timeline": [{ "stageId", "orderNo", "stageName", "ownerRole", "maxDays", "state": "DONE\|CURRENT\|UPCOMING", "enteredOn", "completedOn", "completedBy", "dueDate", "obligationState" }] } }` |
| POST | /api/applications/import | OFFICER, SUPERVISOR, HEAD_OFFICE | multipart/form-data, one file in field `file` (.csv, text, max 2 MB, max 200 rows). Columns (header row, case-insensitive): `institutionId`, `newOrExisting` (NEW\|EXISTING), `programmeLevel` (UG\|PG\|DIPLOMA), `submittedOn` (optional YYYY-MM-DD), `assignedOfficerEmail` (officer: empty or own email; supervisor: required, own team; head office: required). Row 1 is the header | 200 `{ "data": { "total", "imported", "failed", "errors": [{ "row", "field", "message" }], "created": [{ "row", "id", "appCode" }] } }`. Valid rows are imported even if others fail. 400 `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `FILE_REQUIRED`, `INVALID_FILE`, `INVALID_CSV`, `EMPTY_FILE`, `MISSING_COLUMNS`, `TOO_MANY_ROWS`; 401; 403 |