# SIH26262: AICTE approval workflow automation

Smart India Hackathon 2026, problem SIH26262.

A tracking-and-escalation layer that sits beside the existing AICTE portal and does not replace it. It follows what
happens to an application after it is submitted: stage delays, Expert Visit Committee (EVC) visits, undertakings given
by institutions, and documents that are about to expire. Officers still make every decision. The platform only routes
work, reminds the right person at the right time, and escalates what is late.

Live demo: `<fill in: Vercel address>`  |  Backup video: `<fill in: link>`  |  Slides: `docs/reference/`

## The problem

An approval can stall silently. A stage runs past its limit, an EVC visit is never scheduled, an institution promises to
fix something and nobody checks, a lease or fire certificate expires. Nobody is told until it is too late.

## The idea: everything is an obligation

An **obligation** is an item with an owner, a due date and a status. Stage deadlines, EVC visits, undertakings and
document expiry are all obligations (kinds `STAGE`, `EVC`, `UNDERTAKING`, `DOCUMENT`). One daily job moves every open
obligation along the same **alert ladder**:

`OPEN` > `REMINDER_SENT` > `DUE_TODAY` > `OVERDUE` > `ESCALATED` > `REPORTED` (and `DONE`, the exit from any state)

| Kind | Default steps (days before the due date; negative = days after) |
| --- | --- |
| Stage | 2 (reminder), 0 (due today), -1 (overdue), -3 (escalated to the supervisor), -7 (reported to head office) |
| EVC visit | 7, 3 and 1 reminders, then the same steps as a stage |
| Undertaking | 5 (reminder), then the same steps as a stage |
| Document | 90, 60 and 30 calendar days before expiry, then the same steps after it |

Stages, EVC visits and undertakings count working days (weekends and the holidays table are skipped). Documents count
calendar days. Head office can change all of these timings, channels and recipients on the Settings screen. Changes apply
from the next daily run, and every change is audited.

## What it does

| Module | What you can do |
| --- | --- |
| A. Workflow | Submit an application (or import a CSV). The rules engine picks one of four routes and dates every stage. Officers complete stages and the file moves on |
| B. Dashboards and reports | Four role dashboards, a head-office bottleneck chart and ageing buckets, pending, overdue and compliance reports, CSV export |
| C. EVC | Queue of files ready for a visit, calendar and list, minimum-notice rule, record the visit |
| D. Undertakings | Officer records a promise, the institution uploads proof, the officer accepts or rejects (a rejection reopens it) |
| E. Documents | Track document validity, early warnings, and a renewal flow the officer confirms |
| F. Alerts | Daily job, in-app bell, email (preview mode when there is no network), an SMS stub, escalation to the supervisor and then head office |

### Roles and data scope

| Role | Sees | Typical use |
| --- | --- | --- |
| `OFFICER` | only the files assigned to them | work stages, schedule EVC, verify proofs |
| `SUPERVISOR` | the files of their team | overdue and escalated items, approvals |
| `HEAD_OFFICE` | everything | dashboards, reports, settings, run the daily check |
| `INSTITUTION` | only its own applications | track stage, upload proofs, renew documents |

The scope is enforced on the server for every query, not only in the menu.

### The four routes

The route is chosen by data (`route_rules`), never by code. Stages and day limits live in the database
(`routes`, `route_stages`). The day limits in the seed are placeholders until they are checked against the AICTE handbook.

| Application | Route |
| --- | --- |
| New, postgraduate | EVC + SAC/SHC |
| New, undergraduate or diploma | Scrutiny + EVC |
| Existing, postgraduate | Only EVC |
| Existing, undergraduate or diploma | Only scrutiny |

## Architecture

```
React + Vite (client)  --/api-->  Express API (server)  --Prisma-->  PostgreSQL
                                     |
                                     +-- node-cron: daily job at 06:00 IST
                                     +-- channels: in-app, email (Nodemailer), SMS stub
```

- Client: React 19, Vite 6, Tailwind 4, react-router-dom, axios, recharts
- Server: Node.js, Express 4, Prisma 6, PostgreSQL, zod, bcrypt, jsonwebtoken (HTTP-only cookie), multer, node-cron,
  nodemailer, helmet, express-rate-limit
- Tests: Vitest and Supertest
- Hosting: Neon (database), Render (API), Vercel (client, proxies `/api` to the API so the browser sees one domain)
- Dates are stored in UTC and shown in IST

```
client/            React app
server/
  prisma/          schema.prisma, migrations, seed
  src/             routes, controllers, services, middleware, jobs, channels, utils
  scripts/         portal sync, load-test timing
  tests/           Vitest and Supertest tests
docs/              routes, roles, user stories, API contract, deploy guide, demo script, handoff notes
.env.example
```

## Setup (Windows, PowerShell)

Needs Node.js 22 or newer, PostgreSQL 14 or newer, and Git.

```powershell
git clone <repository-url>
cd sih26262

# 1. configuration
Copy-Item .env.example server\.env
# edit server\.env: set the password in DATABASE_URL, and MAIL_MODE=preview if you have no SMTP account

# 2. database (once)
psql -U postgres -c "CREATE DATABASE sih26262;"

# 3. install
cd server; npm install; cd ..\client; npm install; cd ..\server

# 4. migrate and load the demo data (drops everything first)
npm run reset

# 5. run the API (port 4000)
npm run dev
```

In a second PowerShell window:

```powershell
cd sih26262\client
npm run dev        # http://localhost:5173 (the dev server proxies /api to port 4000)
```

Run every server command from `server\`. Running Vitest from the repository root ignores the server config and breaks
the count-based tests.

### Demo accounts (password for all: `Demo@1234`)

| Email | Role |
| --- | --- |
| `officer1@demo.test` | Officer |
| `supervisor1@demo.test` | Supervisor (officer1's team) |
| `head1@demo.test` | Head office |
| `institution1@demo.test` | Institution |

All data is fake. `npm run reset` restores it at any time.

### Demo numbers

A fresh seed shows **128** applications in progress, **14** due this week, **6** overdue and **2** escalated.
Check them with `npm run seed:check` (it prints `DEMO NUMBERS OK`). The seed builds due dates from the day you run it,
so reset on the day you present.

## Commands

| Where | Command | What it does |
| --- | --- | --- |
| `server\` | `npm run reset` | drop, migrate and reseed the database |
| `server\` | `npm run dev` | API with auto-restart |
| `server\` | `npm test` | all tests (one file at a time, they share one real database and clean up after themselves) |
| `server\` | `npm run seed:check` | compare the database with the demo numbers |
| `server\` | `npm run lint` | ESLint |
| `server\` | `npm run seed:load` / `npm run seed:load -- --clean` | add or remove 5,000 load-test applications (development only) |
| `server\` | `npm run perf:check` | time every dashboard page against the 3-second target |
| `server\` | `npm run portal:sync` | mock AICTE portal feed from a CSV (adds real files; reset afterwards) |
| `client\` | `npm run dev`, `npm run build`, `npm run lint` | development server, production build, ESLint |

While load data exists, set `DISABLE_CRON=true` and do not run the daily check; remove it (`--clean`) or reset before the demo.

## Configuration (`server\.env`, listed in `.env.example`)

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | session signing key (32+ random characters in production) and lifetime (`1h`) |
| `API_PORT` | API port (4000) |
| `CLIENT_ORIGIN` | the client address allowed by CORS |
| `NODE_ENV` | `production` on the host (turns on the startup safety check and secure cookies) |
| `TRUST_PROXY` | number of proxies in front of the API (`2` behind Vercel and Render) |
| `COOKIE_SAMESITE` | `lax` (default); `none` only if client and API are on different domains |
| `MAIL_MODE`, `MAIL_FROM`, `SMTP_*` | `smtp` sends mail; `preview` sends nothing and shows mail on the Email preview screen |
| `SMS_PROVIDER` | `stub` (logs only) |
| `UPLOAD_DIR` | where proof and renewal files are stored (outside the web root) |
| `TZ`, `DISABLE_CRON` | time zone, and `true` to switch the 06:00 job off |

## Try the whole flow

1. `officer1`: create an application, complete the first stages, schedule an EVC visit, complete it.
2. `supervisor1`: approve the file. `officer1`: record an undertaking on it.
3. `institution1`: upload proof. `officer1`: reject it, then accept the second upload.
4. `institution1`: add a lease deed that expires in 60 days.
5. `head1`: Daily check > run for today, then run again with later dates (expiry day, +1, +3, +7) and watch the lease
   move from reminder to expired, escalated and reported. Alerts appear in the bell and on the Email preview screen.

`docs/e2e-expected.md` lists the alert expected at each step. `server/tests/e2e.test.js` runs the same walk as an
automated test. `docs/demo-script.md` is the 5-minute presentation script.

## Tests and security

- 325 or more automated tests: the rules engine, working-day maths, every ladder transition, idempotency, role scoping,
  uploads, dashboards, reports, and an end-to-end walk of one application
- Every protected endpoint answers 401 without a login (tested); roles and ownership are checked on the server
- bcrypt hashes, lockout after 5 failed logins, rate limits on login and reports, HTTP-only session cookie with a 1-hour
  expiry, HS256-only tokens, zod validation on every body, Prisma parameters only (no user input in raw SQL)
- Uploads: PDF, JPG and PNG only, real type checked from the file bytes, 10 MB cap, renamed, stored outside the web root
- Append-only audit log of logins, stage moves, uploads, verifications, exports and settings changes
- In production the server refuses to start with the default `JWT_SECRET`

## Documentation

| File | Contents |
| --- | --- |
| `docs/routes.md`, `docs/roles.md`, `docs/user-stories.md` | the rules everything is built on |
| `docs/api-contract.md` | every endpoint: method, path, role, request, response |
| `docs/deploy.md` | deploying to Neon, Render and Vercel, smoke test, backup plan |
| `docs/demo-script.md`, `docs/e2e-expected.md` | demo script and expected alerts |
| `docs/user-manual.md` | short manual for each role |
| `docs/user-test.md` | usability test plan |
| `docs/handoff/stage-N.md` | what each build stage delivered, deviations and known issues |

## Scope and known limits

Not built, on purpose: live AICTE portal sync (CSV import and a mock adapter instead), a mobile app (the site is
responsive; the sidebar is hidden on very narrow screens), machine learning, real SMS (a stub logs the message) and PDF
export (reports export as CSV).

Known limits: stage names, day limits and the 7-day EVC notice are placeholders until checked against the handbook;
uploaded files live on the host's local disk (temporary on free hosting); dashboards are computed in memory per request
(5,000 applications load in under 3 seconds); there are no automated client tests. The full list is in
`docs/handoff/stage-10a.md`.

## Team

| Name | Stages |
| --- | --- |
| Sanjay Suriya | Stages 5 to 10B |
| Sharvesh Kumar | `<fill in: stages>` |
| Arun | `<fill in: stages>` |
| Sanjay Vallavan | `<fill in: stages>` |
| Kamalini | `<fill in: stages>` |
| Vaidhavaroghini | `<fill in: stages>` |

Branches: `main` (always runs, demo only from here), `dev` (integration), `stage-N-short-name`. Commits use `feat:`,
`fix:`, `test:`, `docs:` and `chore:`; each stage is tagged `stage-N-done` after review.
