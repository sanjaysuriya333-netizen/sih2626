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
