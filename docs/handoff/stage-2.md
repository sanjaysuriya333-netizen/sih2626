# Stage 2 handoff: Project skeleton, database and seed
Owner: Sanjay Suriya   Date: 2026-10-26   Tag: stage-2-done

## Done
- server/: Express 4 app (app.js, server.js), JSON error and 404 middleware, helmet, CORS for CLIENT_ORIGIN
- GET /api/health
- client/: Vite + React, Tailwind, react-router-dom, axios (Vite proxies /api to port 4000)
- Layout (sidebar, top bar with bell placeholder), ProtectedRoute stub (always allows), Login placeholder page
- ESLint + Prettier configured for server and client
- Prisma schema for the 15 tables, enums, indexes; first migration `init`
- Seed: 4 regions, 20 institutions, 12 officers, 4 supervisors, 2 head office, 20 institution contacts, holidays, 4 routes with 21 stages, alert rules, 150 applications
- npm run reset (drops, migrates, reseeds), npm run seed:check (verifies demo numbers)

## Done test result
- Page at http://localhost:5173 shows "API OK"
- npm run reset run twice and from a clean copy: Seed complete, seed:check prints DEMO NUMBERS OK
- Demo numbers: 128 in progress, 14 due this week, 6 overdue, 2 escalated
- npm test: 7 passed; npm run lint: clean (server and client)

## How to run
- Windows PowerShell, project folder Documents\sih26262
- server/: copy .env.example to .env, set DATABASE_URL and JWT_SECRET, then npm install, npm run reset, npm run dev (port 4000)
- client/: npm install, npm run dev (port 5173)
- Tests: npm test in server/ (seed.test.js needs a seeded database, so run npm run reset first)

## Endpoints added (also in docs/api-contract.md)
- GET /api/health (any role, no login)

## Tables / enums / services added or changed
- All 15 tables created (route_rules NOT created; Stage 4 adds it)
- Enums: Role, ObligationKind, ObligationState (includes DONE), plus status enums for application, EVC, undertaking, proof, document, channel, recipient role
- Added columns not in the guide: institutions.institution_type, applications.new_or_existing, applications.programme_level (Stage 4 route rules need them); closed_on on applications, undertakings, obligations; active on users and alert_rules
- Seed split into prisma/seed/data.js (routes, stages, holidays, alert rules), reference.js, applications.js

## Deviations from the plan
- Express 4 and Prisma 6 pinned (newer majors change setup)
- Demo accounts: officer1 reports to supervisor1 (Region A); head1 has no region; institution1 is linked to institution 1
- Seeded obligation due dates are set directly relative to the day the seed runs, so demo numbers hold on any day; they are not derived from max_days
- Seeded applications get their route through a copy of the selection rule in seed code; Stage 4 replaces it with the rules engine reading route_rules
- Alert rules use days_before: positive = before due, 0 = on due date, negative = days after due
- Client has no tests yet

## Known issues / not done
- max_days are placeholder working-day values (2/10/7/15/7/5 etc.), not from the handbook
- Holidays are a short placeholder list
- Stage names, route rules and institution types still unchecked against the handbook
- Wireframe sketches and task board still not done (from Stage 1)
- ProtectedRoute is a stub; no login yet

## Next owner: read these first
- docs/handoff/stage-1.md and this note
- server/prisma/schema.prisma and server/prisma/seed/data.js
- docs/roles.md (Stage 3 enforces it), docs/routes.md (Stage 4 builds route_rules from it)
- server/src/middleware/errorHandler.js (standard error shape)
