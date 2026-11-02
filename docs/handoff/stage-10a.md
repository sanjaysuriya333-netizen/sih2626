# Stage 10A handoff: Testing and security hardening
Owner: <fill in: 10A owner>   Tag: stage-10a-done   Next owner: <fill in: 10B owner>

## Done
- End-to-end test (`server/tests/e2e.test.js`): ONE application on "Scrutiny + EVC" from submission to a lease expiry: both scrutiny stages (the second one late, so it climbs to ESCALATED and REPORTED), the EVC queue, schedule and visit, approval by the supervisor, an undertaking with a rejected and then an accepted proof, and a lease that runs through DUE_TODAY, EXPIRED, ESCALATED and REPORTED. 14 alerts are asserted (state, level, recipient, subject, in-app and email) and each one is checked to be idempotent. The expected alert at every step is written in `docs/e2e-expected.md`. The test deletes everything it creates
- Coverage gaps filled in `rulesEngine`, `workingDays`, `ladder` and `dailyCheck` (`@vitest/coverage-v8` added as a dev dependency). 100% of lines in all four files
- Daily job fixed (see Deviations): it now looks only at the stage a file is at, and stops for REJECTED and CLOSED files
- Security hardening (table below): startup config check, HS256-only tokens, configurable cookie SameSite, `trust proxy`, rate limit on reports and exports, password rule in code, `VITE_API_URL` for a split deployment
- Prisma audit finding fixed with an `overrides` entry (`deepmerge-ts ^8`)
- `docs/user-test.md`: tasks per role, observation sheet, what to record when someone hesitates, pass rule

## Done test result
- E2E script passes: `npx vitest run --silent tests/e2e.test.js`: 8 tests passed
- `npx vitest run --silent` in server/: 325 tests passed in 28 files, 0 failed (the 35 endpoint login checks bring 290 to 325). One duplicate-recipient test was added after that run, so the next full run shows 326
- Coverage of the four files (`--coverage.include` on each): ladder, rulesEngine and workingDays 100% statements, branches, functions and lines. dailyCheck.js 100% of lines; the duplicate-recipient branch (line 67) is now tested, and the missing-recipient branch (line 65) is deliberately left uncovered (see Known issues). Only these four files were measured, not the whole project
- `npm run seed:check`: DEMO NUMBERS OK (128 / 14 / 6 / 2)
- `npm run lint` clean in server/ (0 errors, 0 warnings). Client lint clean; `npm run build` in client/ ok (727 modules, 11.38 s)
- `npm audit`: client 0 vulnerabilities. Server: the 3 high findings (prisma, @prisma/config, deepmerge-ts) are fixed by the override, which stayed in; the test suite passes with it. The server audit now reports 6 moderate findings, all from the ESLint dev tooling (minimatch). Only high-severity findings are fixed in 10A, so these are left
- Fresh clone plus .env plus `npm run reset` plus `npm test`: passed, 325 tests in 28 files (owner-reported)
- `npm run perf:check`: not re-run in 10A (no change to the dashboards or load data)
- User test (two outside people, 5 tasks each): <fill in: pending until the sessions are run; the tester count, tasks passed and screens fixed go here>

## Security table
| Area | Result | Evidence |
| --- | --- | --- |
| Passwords | bcrypt cost 10 or more, lockout after 5 failed logins for 15 minutes. Minimum length: no endpoint sets a password, so the rule lives in `utils/password.js` (`validatePassword`: at least 8 characters, a letter and a digit); `Demo@1234` passes it. It is NOT yet called by the seed or any endpoint, so any future password-setting code must call it | `security.test.js` (every stored hash is bcrypt cost 10+; rule cases), `auth.test.js` (lockout) |
| Sessions | Cookie is HTTP-only, `secure` in production (forced on when SameSite=None), SameSite `lax` by default (`COOKIE_SAMESITE`), 1-hour expiry, cleared on logout. Tokens are verified with HS256 only; a token with `alg: none` is rejected | `security.test.js` |
| Access control | Every non-public route sits behind `authenticate` and `requireRole`, and every application query goes through `scopeApplications`. Reports and exports are staff only (institutions get 403) | Scope tests from Stages 3 to 9, `security.test.js`: 35 endpoints from the contract all answer 401 without a cookie, and reports are staff only (45 tests in the file) |
| Input | Bodies validated with zod. Only raw SQL: the advisory lock in `applicationService.js` (a tagged template with a constant key, no user input) | grep of `$queryRaw`, `$executeRaw` and the Unsafe variants |
| Uploads | Type allow-list (PDF, JPG, PNG) checked by file signature, 10 MB cap, random file name, stored under `UPLOAD_DIR` and never served statically. CSV import: .csv only, 2 MB, 200 rows | Stage 5 to 7 tests |
| Headers and limits | helmet defaults, CORS allow-list from `CLIENT_ORIGIN`, login limit 20 per 15 minutes per IP, reports 120 per minute and exports 10 per minute per user (429 `RATE_LIMITED`) | `security.test.js` (limiter answers 429 in the standard shape) |
| Secrets | `.env` and `uploads/` are git-ignored. In production the server refuses to start with `JWT_SECRET` unset, `change_me` or shorter than 32 characters, or with `CLIENT_ORIGIN`/`DATABASE_URL` missing or a bad `COOKIE_SAMESITE`. Demo keys are rotated after the event (10B) | `security.test.js`, `utils/checkConfig.js` |
| Audit | Logins, failed logins, blocked logins, lockouts, logouts, stage moves, EVC, uploads, verifications, renewals, report exports, daily check runs and all three settings changes write audit rows. Marking a notification as read is deliberately not audited (Stage 8 deviation, accepted) | grep of `action:` |
| Privacy | All seed data is fake | seed files |

## How to run
- After pulling: `npm install` in server/ and client/ (new dev dependency `@vitest/coverage-v8`; the lockfile has the Prisma override)
- Coverage of the key files, from server/: `npx vitest run --silent --coverage --coverage.reporter=text --coverage.include="src/services/rulesEngine.js" --coverage.include="src/services/workingDays.js" --coverage.include="src/services/ladder.js" --coverage.include="src/jobs/dailyCheck.js"`
- New env vars (in `.env.example`): `NODE_ENV` (set `production` on the host), `TRUST_PROXY` (set `1` behind Render or Railway, so rate limits see the real client IP), `COOKIE_SAMESITE` (`lax` default; `none` for a client and API on different domains). Client build variable: `VITE_API_URL` (for example `https://my-api.onrender.com/api`; empty means `/api` through the Vite proxy)
- Run every server command from `server\`

## Endpoints added (also in docs/api-contract.md)
- None. `GET /api/reports/:type` is now limited to 120 requests per minute per user and `GET /api/reports/:type/export` to 10 per minute per user; both answer 429 `RATE_LIMITED`. Add the 429 to those two rows in the contract

## Tables / enums / services added or changed
- No schema change, no migration
- `utils/checkConfig.js` (`checkConfig`, `findProblems`, called from `server.js` only), `utils/password.js` (`validatePassword`), `middleware/rateLimit.js` (`userLimiter`)
- `server.js`, `app.js` (`trust proxy`), `middleware/auth.js` (HS256 only), `controllers/authController.js` (`cookieOptions` exported, SameSite from env), `routes/reports.js` (limiters), `jobs/dailyCheck.js` (`isLive`), `client/src/api.js` (`VITE_API_URL`)
- Tests added: `e2e.test.js` (8), `security.test.js` (45), and extra cases in `dailyCheck.test.js` (4), `ladder.test.js` (1), `rulesEngine.test.js` (2)

## Deviations from the plan
- The Stage 7 note said the daily job skips STAGE obligations of stages a file has not reached and of files that are not IN_PROGRESS. The code did not do that, so API-created files (one STAGE obligation per stage) would have alerted for future stages. Fixed here: a STAGE obligation fires only while its file is IN_PROGRESS and at that stage. Other kinds fire unless the file is REJECTED or CLOSED. APPROVED files keep alerting on documents and undertakings, because the demo's lease expiry happens after approval. This also closes the old "document obligations keep alerting on REJECTED or CLOSED files" issue
- No password-setting endpoint exists, so the minimum-length row is satisfied by `validatePassword` plus a test, not by an endpoint
- Prisma 7 (the `npm audit fix --force` route) was not installed; the override was used instead
- A GitHub-style CSRF token was not added (see Known issues)

## Known issues / not done
- With `COOKIE_SAMESITE=none` (client and API on different domains) the cookie is sent on cross-site requests, and the API has no CSRF token. Only the CORS allow-list and the JSON body requirement protect state-changing calls. 10B should prefer one domain (or a proxy rewrite on the client host) if it can
- `validatePassword` is not called by any code path yet
- `dailyCheck.js` line 65 (`if (!userId) continue`) is not covered: it needs a recipient role with no user, which the seed cannot produce. Coverage was measured for four files only
- A failed EMAIL or SMS send is retried only the next time the same obligation has a transition. SMS has no phone number to send to
- A Friday item checked on a Saturday reads DUE_TODAY until Monday (unit-tested, accepted)
- `seed:check` uses the UTC date and the dashboards use the IST date (they differ between 00:00 and 05:30 IST)
- Dashboards are computed in memory per call (5,000 applications passed `perf:check` in Stage 9; not re-run here)
- The overdue report lists obligations, so one file can appear more than once
- Uploaded files live on the server's local disk, which is not persistent on free hosts (10B)
- `node-cron` runs inside the web service; on a host that sleeps or restarts, use the host's cron and `DISABLE_CRON=true` (10B)
- No client tests; the browser walkthrough was done by hand
- The user test has not been run (see above)
- Stage names, `max_days` and the 7-day EVC notice are placeholders, not checked against the handbook. `docs/reference/` is empty in the repo, so the handbook is not available here. <fill in: handbook holder> holds the handbook and the 10B owner owns the final-checklist row "Four routes and day limits match the handbook" (data in `prisma/seed/data.js`, editable in Settings)
- Real SMS and PDF export are not built (cut list; CSV only)
- `docs/handoff/stage-8.md` and `stage-9.md` still contain unfilled `<fill in>` items

## Next owner: read these first
- `server/tests/e2e.test.js` and `docs/e2e-expected.md`: the walk to reuse as the demo script. The expected alerts follow slide 6 (submit, scrutiny, EVC alert, approve with an undertaking, upload proof, lease-expiry escalation)
- Deployment settings that change security (set these on the host): `NODE_ENV=production`, a random `JWT_SECRET` of 32 or more characters, `CLIENT_ORIGIN` (the exact client URL), `TRUST_PROXY=1`, `COOKIE_SAMESITE` (`none` only for different domains), `UPLOAD_DIR`, `DISABLE_CRON`, `MAIL_MODE`, `SMTP_*`, `MAIL_FROM`, and `VITE_API_URL` at client build time
- Demo recipe for the live link: `npm run reset` (or the one-time seed on the host), then "Run daily check now" as head1 with an `asOf` date (see `stage-7.md`). Remove load data and set `DISABLE_CRON=true` before demos that must not send alerts
- `docs/user-test.md`: if the sessions are still open, run them against the deployed or local build before the demo
- RULES that still apply: every application query uses `where: { AND: [{ id }, scopeApplications(req.user)] }`; every write calls `logAction` inside its transaction; every endpoint gets a row in `docs/api-contract.md`; new env vars go into `.env.example` in the same commit; client component files export only components; run all server commands from `server\`
