# Roles and permissions

Enum `Role`: `OFFICER`, `SUPERVISOR`, `HEAD_OFFICE`, `INSTITUTION`.
Every rule below is enforced on the server (role check plus ownership/scope check), never only in the UI.

## Data scope

| Role | Sees |
| --- | --- |
| OFFICER | Only applications assigned to them |
| SUPERVISOR | Applications of officers whose `supervisor_id` = this user |
| HEAD_OFFICE | All applications |
| INSTITUTION | Only its own institution's applications |

## Permission matrix

Legend: ✔ = allowed within the scope above, — = not allowed.

| Action | OFFICER | SUPERVISOR | HEAD_OFFICE | INSTITUTION |
| --- | --- | --- | --- | --- |
| View own files | ✔ | ✔ | ✔ | ✔ (own institution) |
| View team files | — | ✔ | ✔ | — |
| View all files | — | — | ✔ | — |
| Create application | ✔ | ✔ | ✔ | ✔ (submit own) |
| Complete stage | ✔ | ✔ | ✔ | — |
| Schedule EVC | ✔ | ✔ | ✔ | — |
| Record undertaking | ✔ | ✔ | ✔ | — |
| Upload proof | — | — | — | ✔ |
| Verify proof | ✔ | ✔ | ✔ | — |
| Edit settings | — | — | ✔ | — |
| Run daily check | — | — | ✔ | — |
| Add document | ✔️ | ✔️ | ✔️ | ✔️ (own files) |
| Upload document renewal | — | — | — | ✔️ |
| Confirm document renewal | ✔️ | ✔️ | ✔️ | — |

Notes: "Complete stage" for an INSTITUTION-owned stage (clarification) is done by uploading the response; the officer then completes the stage.

## Escalation chain

1. Obligation owner (officer, or institution contact notified through the assigned officer)
2. The owner's supervisor (`users.supervisor_id`)
3. If no supervisor: the head-office user for the owner's region

Escalation timing and recipients are rows in `alert_rules`, editable by HEAD_OFFICE.

## Regions

Region names are not decided yet. Use the placeholders `Region A`, `Region B`, `Region C`, `Region D` in the seed. Renaming later is a data change only.

## Demo accounts (seeded in Stage 2, password `Demo@1234`)

| Email | Role |
| --- | --- |
| officer1@demo.test | OFFICER |
| supervisor1@demo.test | SUPERVISOR |
| head1@demo.test | HEAD_OFFICE |
| institution1@demo.test | INSTITUTION |
