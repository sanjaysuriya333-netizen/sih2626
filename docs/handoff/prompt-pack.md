# Prompt pack (paste into every new Claude chat)

Paste in this order: Starter Prompt, Local overrides, Master Brief, Conventions, previous handoff note, then the Stage block from the Guide.

## Starter Prompt

You are helping me build one stage of a student hackathon project (SIH26262, AICTE approval workflow automation) that several teammates build in turns. I am the owner of Stage N. Below are the Master Brief, the Conventions, the previous stage's handoff note, and my Stage N block. Rules: build only what my stage lists; follow the conventions exactly; do not change locked decisions; write tests for what you build; keep code simple and commented where the logic is not obvious. Work in small steps, tell me which files to create or change, and after each step tell me the exact command to run and what output I should see. If the previous handoff note conflicts with the repo, tell me before changing anything. At the end, help me run the Quality Gate and write my handoff note.

## Local overrides (this team, Stages 1 to 4)

- Windows PowerShell; give PowerShell commands only
- Single computer, project folder Documents\sih26262, local git only, work on main, commit and tag stage-N-done at the end of each stage
- Node v24.21.0, npm 11.19.0, git 2.55, PostgreSQL 17.11
- Working week Monday to Friday; regions are placeholders Region A to Region D
- Never ask me to paste passwords or .env contents into the chat

## Master Brief

Project: Smart India Hackathon 2026, problem SIH26262. A tracking-and-escalation layer that sits beside the existing AICTE portal and does not replace it. It tracks what happens after an application is submitted: stage delays, EVC (Expert Visit Committee) visits, undertakings, and expiring documents. Officers decide; the platform only routes, reminds and escalates.

Core idea: everything is an obligation (an item with an owner, a due date and a status). A daily job moves each obligation along an alert ladder. Build that once. Stage deadlines, EVC visits, undertakings and document expiry all plug into it.

Roles (enum Role): OFFICER, SUPERVISOR, HEAD_OFFICE, INSTITUTION.
Data scope: officers see only their own files; supervisors see their team's; head office sees all; institutions see only their own.

Routes (4, frozen in Stage 1): Only scrutiny; Scrutiny + EVC; Only EVC; EVC + SAC/SHC. Stages and day limits live in the database (routes, route_stages), never hard-coded.

Obligation kinds (enum): STAGE, EVC, UNDERTAKING, DOCUMENT.
Obligation states (enum), the alert ladder: OPEN → REMINDER_SENT → DUE_TODAY → OVERDUE → ESCALATED → REPORTED. DONE is the exit from any state.

Stack (locked):
- Frontend: React + Vite (JavaScript), react-router-dom, axios, recharts, Tailwind
- Backend: Node.js + Express, Prisma ORM, PostgreSQL, zod, bcrypt, jsonwebtoken (HTTP-only cookie), multer, node-cron, nodemailer, helmet, express-rate-limit
- Tests: Vitest (or Jest) for units, Supertest for API
- Hosting (Stage 10): Render/Railway/Neon for API and DB; Vercel/Netlify for the client

Scope cuts (do not build): live AICTE portal sync (use CSV import plus a mock adapter), mobile app (site must be responsive), machine learning. SMS is a stub provider that logs.

Data tables (15): users, institutions, routes, route_stages, applications, stage_history, evc_visits, undertakings, proofs, documents, obligations, alert_rules, notifications, holidays, audit_log. (Stage 4 adds route_rules.) Never delete rows; use a status or closed_on. Store all dates in UTC and convert to IST only at display.

Demo numbers the seed data must reproduce: about 128 in progress, 14 due this week, 6 overdue, 2 escalated.

## Conventions

Repo layout:
```
client/            React app
server/
  prisma/          schema.prisma, migrations, seed.js
  src/             routes/ controllers/ services/ middleware/ jobs/ utils/ app.js server.js
  tests/
docs/              routes.md roles.md user-stories.md api-contract.md wireframes/ reference/ handoff/
.env.example README.md
```

Env vars (.env.example must list all): DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN=1h, API_PORT=4000, CLIENT_ORIGIN=http://localhost:5173, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, UPLOAD_DIR=./uploads, TZ=UTC. Add new vars to .env.example in the same commit that uses them.

API response shape (every endpoint):
- Success: `{ "data": <payload>, "meta": { "page": 1, "pageSize": 20, "total": 0 } }` (meta only on lists)
- Error: `{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [] } }`
- Status codes: 200 OK, 201 created, 400 validation, 401 not logged in, 403 wrong role or not owner, 404 not found, 409 conflict
- All routes under /api. Health is GET /api/health.

Auth contract: cookie named token (HTTP-only, same-site). After middleware, req.user = { id, role, region, institutionId, supervisorId }.

Naming: database tables snake_case plural (Prisma @@map), Prisma models PascalCase, JSON fields camelCase, JS files camelCase, React components PascalCase.

Git: commits use feat:, fix:, test:, docs:, chore:. Tag stage-N-done after each stage.

Demo accounts (seeded in Stage 2, password for all Demo@1234): officer1@demo.test, supervisor1@demo.test, head1@demo.test, institution1@demo.test.

Commands every stage must keep working: `npm run reset` (in server/: drops, migrates, reseeds); `npm run dev` in server/ and client/; `npm test` in server/.

API contract file: every endpoint added gets a row in docs/api-contract.md (method, path, role allowed, request JSON, response JSON).

## Quality Gate (every stage, before tagging)

- [ ] The stage's done test passes exactly as written
- [ ] npm test passes in server/ (and client/ if it has tests)
- [ ] npm run lint is clean
- [ ] A copy of the folder plus .env from .env.example plus npm run reset runs without errors
- [ ] No secrets, .env files or uploads/ content committed
- [ ] Every new endpoint is in docs/api-contract.md and uses the standard response shape
- [ ] Every new write action creates an audit_log row (from Stage 3 onward)
- [ ] Every new route checks role and ownership on the server (from Stage 3 onward)
- [ ] Handoff note written in docs/handoff/stage-N.md

## Handoff note template (docs/handoff/stage-N.md)

```
# Stage N handoff: <name>
Owner: <name>   Date: <date>   Tag: stage-N-done

## Done
## Done test result
## How to run
## Endpoints added (also in docs/api-contract.md)
## Tables / enums / services added or changed
## Deviations from the plan
## Known issues / not done
## Next owner: read these first
```
