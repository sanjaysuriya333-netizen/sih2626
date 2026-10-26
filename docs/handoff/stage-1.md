# Stage 1 handoff: Preparation and design
Owner: Sanjay Suriya   Date: 2026-10-26   Tag: stage-1-done

## Done
- Repo layout created in Documents\sih26262 (client, server, docs with reference/wireframes/handoff, README, .gitignore, .env.example)
- docs/routes.md: four route tables and the route selection rule
- docs/roles.md: permission matrix, data scope, escalation chain, demo accounts
- docs/user-stories.md: 15 stories
- docs/wireframes: 8 screens described in text (sketches/photos to be added)
- docs/api-contract.md: header, response shapes, health endpoint row
- Local git initialised on main

## Done test result
- node v24.21.0, npm 11.19.0, git 2.55.0, psql 17.11 (all run on this machine)
- Team-wide version check: not done (single-machine workflow for Stages 1 to 4)

## How to run
- Windows PowerShell, project folder Documents\sih26262
- PostgreSQL 17 local, database `sih26262`, port 5432
- No application code yet

## Endpoints added (also in docs/api-contract.md)
- None (GET /api/health is listed as the planned first endpoint)

## Tables / enums / services added or changed
- None

## Deviations from the plan
- Single computer and local git only: no GitHub, no dev or stage branches, no PRs; work on main and tag after each stage
- ESLint and Prettier configs deferred to Stage 2 (created with the projects)
- Working week set to Monday to Friday
- Region names not decided: seed uses Region A to Region D

## Known issues / not done
- Stage names, route selection rules and institution types in routes.md are assumptions, not checked against the handbook
- max_days is TBD for every stage; Stage 2 must set seed values (and Stage 4 tests depend on them)
- Wireframes are text descriptions only; sketches or photos not added yet
- Task board not created

## Next owner: read these first
- docs/routes.md (seeded into routes, route_stages, route_rules)
- docs/roles.md (users, scope rules, demo accounts)
- .env.example (copy to server/.env and set DATABASE_URL with your real password)
