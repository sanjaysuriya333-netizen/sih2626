# Routes

Source of truth for Stage 2 (seed), Stage 4 (rules engine) and Stage 5 (workflow).
The database tables `routes`, `route_stages` and `route_rules` are seeded from this file. Nothing here is hard-coded in application code.

**Working week:** Monday to Friday. Saturday, Sunday and rows in the `holidays` table are non-working days. All dates stored in UTC.

> **Status:** stage names and selection rules below are working assumptions (the handbook was not used for this draft). Replace them with handbook values later by editing the seed data only. `max_days` is a placeholder (`TBD`) until set in the seed or the settings screen.

## Route 1: Only scrutiny

| order_no | stage_name | max_days | owner_role |
| --- | --- | --- | --- |
| 1 | Application received | TBD | OFFICER |
| 2 | Document scrutiny | TBD | OFFICER |
| 3 | Clarification from institution | TBD | INSTITUTION |
| 4 | Approval decision | TBD | SUPERVISOR |

## Route 2: Scrutiny + EVC

| order_no | stage_name | max_days | owner_role |
| --- | --- | --- | --- |
| 1 | Application received | TBD | OFFICER |
| 2 | Document scrutiny | TBD | OFFICER |
| 3 | EVC scheduling | TBD | OFFICER |
| 4 | EVC visit | TBD | OFFICER |
| 5 | EVC report review | TBD | OFFICER |
| 6 | Approval decision | TBD | SUPERVISOR |

## Route 3: Only EVC

| order_no | stage_name | max_days | owner_role |
| --- | --- | --- | --- |
| 1 | Application received | TBD | OFFICER |
| 2 | EVC scheduling | TBD | OFFICER |
| 3 | EVC visit | TBD | OFFICER |
| 4 | EVC report review | TBD | OFFICER |
| 5 | Approval decision | TBD | SUPERVISOR |

## Route 4: EVC + SAC/SHC

| order_no | stage_name | max_days | owner_role |
| --- | --- | --- | --- |
| 1 | Application received | TBD | OFFICER |
| 2 | EVC scheduling | TBD | OFFICER |
| 3 | EVC visit | TBD | OFFICER |
| 4 | EVC report review | TBD | OFFICER |
| 5 | SAC/SHC review | TBD | HEAD_OFFICE |
| 6 | Approval decision | TBD | HEAD_OFFICE |

## Route selection rule (feeds `route_rules`)

Rules are checked by `priority` (lowest first); the first match wins. No match must return a clear error, never a default route.

| priority | institution_type | new_or_existing | programme_level | route |
| --- | --- | --- | --- | --- |
| 1 | any | new | PG | EVC + SAC/SHC |
| 2 | any | new | UG, DIPLOMA | Scrutiny + EVC |
| 3 | any | existing | PG | Only EVC |
| 4 | any | existing | UG, DIPLOMA | Only scrutiny |

Attribute values: `institution_type` = GOVERNMENT, PRIVATE, AUTONOMOUS (assumed); `new_or_existing` = new, existing; `programme_level` = UG, PG, DIPLOMA.

## Adding a fifth route (data only)

Insert one row in `routes`, its stages in `route_stages`, and one row in `route_rules`. No code change.

## Obligations created from a route

Each stage creates one `STAGE` obligation with `due_date = addWorkingDays(stage start, max_days)`. EVC visits, undertakings and documents create their own obligations later (Stages 6 and 7).
