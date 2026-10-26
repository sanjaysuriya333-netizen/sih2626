# Stage 3 handoff: Login, roles and audit log
Owner: Sanjay Suriya   Date: 2026-10-27   Tag: stage-3-done

## Done
- Login, logout and /me with bcrypt compare and a 1-hour JWT in an HTTP-only, same-site cookie named `token` (secure flag on when NODE_ENV=production)
- Lockout: 5 failed logins lock the account for 15 minutes (counter resets when the lock starts and on a successful login); login rate limit of 20 requests per 15 minutes per IP
- Middleware `authenticate` (sets req.user) and `requireRole(...roles)`
- `scopeApplications(user)` data-scope helper
- `logAction` audit service; logins, failed logins, blocked logins, lockouts and logouts are logged
- Frontend: login screen, AuthContext (calls /api/auth/me on load), role-based sidebar menu with logout, ProtectedRoute (redirects to /login, optional `roles` prop), one distinct home card per role
- Supertest suite: wrong password, unknown email, validation, /me for all four roles, logout, officer, supervisor, head office and institution isolation, lockout

## Done test result
- Four demo accounts log in and each lands on a different home screen
- npm test in server/: <N> passed (7 from Stage 2 plus 19 new); npm run lint: clean (server and client)
- Fresh clone plus .env plus npm run reset plus npm test: passed

## How to run
- No new commands or env vars (JWT_SECRET and JWT_EXPIRES_IN were already in .env.example)
- New dependency: cookie-parser (server). After pulling, run npm install in server/, then npm run reset (new migration)
- Tests need a seeded database: run npm run reset first. The lockout test locks supervisor1 and unlocks it again in afterAll

## Endpoints added (also in docs/api-contract.md)
- POST /api/auth/login: public: sets the token cookie
- POST /api/auth/logout: any (no login needed): clears the cookie
- GET /api/auth/me: any logged-in role: current user

## Tables / enums / services added or changed
- users: added failed_logins (int, default 0) and locked_until (nullable timestamp); migration `auth_lockout`
- server/src/middleware/auth.js: authenticate, requireRole
- server/src/services/scope.js: scopeApplications
- server/src/services/audit.js: logAction
- server/src/utils/: prisma.js (shared client), httpError.js (HttpError), asyncHandler.js
- client: context/authState.js, context/useAuth.js, context/AuthProvider.jsx, components/ProtectedRoute.jsx, Sidebar.jsx, pages/Login.jsx, pages/Home.jsx

## Deviations from the plan
- Two extra columns on users for the lockout (not in the 15-table list as written; no new table)
- Audit log is append-only by code (logAction only creates rows; nothing updates or deletes). It is not enforced by a database rule
- 429 added to the status code table in docs/api-contract.md for the login rate limit

## Known issues / not done
- Sidebar links other than Home (/applications, /evc, /undertakings, /settings) have no pages yet; they show nothing until Stages 5, 6 and 8
- authenticate reads the user from the database on every request (so deactivated users are cut off immediately); fine for the demo
- A locked account returns ACCOUNT_LOCKED, which reveals that the email exists. Acceptable for the demo; consider a generic message in Stage 10A
- Logout is only audited when the cookie still holds a valid token
- head1 has no region, so Stage 8's "head-office user for the region" fallback needs a rule for this account
- Client has no tests yet
- Security table items still open for 10A: secure cookie only checked in production mode, CORS allow-list is a single origin

## Next owner: read these first
- server/src/middleware/auth.js (authenticate, requireRole), server/src/services/scope.js, server/src/services/audit.js
- server/tests/auth.test.js: the test-only route shows the pattern to copy
- RULE: every application query must use `where: { AND: [{ id }, scopeApplications(req.user)] }` (never spread the scope into another where object); every write calls logAction; every route uses authenticate plus requireRole
- Throw HttpError(status, code, message) in controllers, wrapped in asyncHandler
- docs/roles.md (permission matrix to enforce from Stage 5), docs/routes.md (Stage 4 builds route_rules from it)
-