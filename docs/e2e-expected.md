# End-to-end walk: expected alerts

Test: `server/tests/e2e.test.js`. One application, route "Scrutiny + EVC" (NEW, UG), institution 1,
officer1, supervisor1, head1. Every alert below is asserted by the test, in-app and by email, and a second
run on the same day must send nothing.

Due dates come from the real current day (the schedule is built from today), so the test reads each due date
from the database and calls `runDailyCheck({ asOf, obligationIds })` for the obligations it created itself.
"Days to due" means working days for STAGE, EVC and UNDERTAKING, and calendar days for DOCUMENT.

Recipient key: OFFICER = officer1, SUPERVISOR = supervisor1 (the officer's supervisor), HEAD = the head-office
user of the officer's region (head1).

| # | Step | Obligation | Days to due | Expected state (level) | Recipient | In-app | Email |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Submission | 6 STAGE obligations, all OPEN | 3 for the current stage | none (only the current stage is checked) | - | 0 | 0 |
| 2 | Stage 1 "Application received" | STAGE | 2 | REMINDER_SENT (1) | OFFICER | 1 | 1 |
| 3 | Stage 2 "Document scrutiny", on the due day | STAGE | 0 | DUE_TODAY (2) | OFFICER | 1 | 1 |
| 4 | Stage 2, three working days late | STAGE | -3 | ESCALATED (4) | SUPERVISOR | 1 | 1 |
| 5 | Stage 2, seven working days late | STAGE | -7 | REPORTED (5) | HEAD | 1 | 1 |
| 6 | EVC visit scheduled, 7 working days before | EVC | 7 | REMINDER_SENT (1) | OFFICER | 1 | 1 |
| 7 | EVC, 3 working days before | EVC | 3 | REMINDER_SENT (2) | OFFICER | 1 | 1 |
| 8 | EVC, 1 working day before | EVC | 1 | REMINDER_SENT (3) | OFFICER | 1 | 1 |
| 9 | Stage 6 "Approval decision" (owner = supervisor) | STAGE | 2 | REMINDER_SENT (1) | SUPERVISOR | 1 | 1 |
| 10 | Undertaking recorded on the approved file, 5 working days before | UNDERTAKING | 5 | REMINDER_SENT (1) | OFFICER | 1 | 1 |
| 11 | Lease deed, 60 days ahead (the 90-day reminder is skipped, not sent late) | DOCUMENT | 60 | REMINDER_SENT (2) | OFFICER | 1 | 1 |
| 12 | Lease, 45 days ahead | DOCUMENT | 45 | none | - | 0 | 0 |
| 13 | Lease, on its last day (document still VALID) | DOCUMENT | 0 | DUE_TODAY (4) | OFFICER | 1 | 1 |
| 14 | Lease, one day after expiry (document becomes EXPIRED) | DOCUMENT | -1 | OVERDUE (5) | OFFICER | 1 | 1 |
| 15 | Lease, three days after expiry | DOCUMENT | -3 | ESCALATED (6) | SUPERVISOR | 1 | 1 |
| 16 | Lease, seven days after expiry | DOCUMENT | -7 | REPORTED (7) | HEAD | 1 | 1 |

Total alerts: 14 (rows 2 to 11, 13 to 16). Each one writes one `ALERT_<LEVEL>` audit row and one IN_APP and one
EMAIL notification row (the seeded rules have both channels on every step).

## Actions between the alerts (also asserted)

| After step | Action | Who | Expected result |
| --- | --- | --- | --- |
| 2, 3 | Complete the stage | officer1 | stage obligation DONE, next stage opens; after stage 2 the file is EVC-ready |
| 6 | Schedule the visit (8 working days ahead) | officer1 | 201, EVC obligation OPEN level 0, file moves to "EVC visit" |
| 8 | Record the visit | officer1 | EVC obligation DONE, file moves to "EVC report review" |
| 9 | Complete "EVC report review", then "Approval decision" with APPROVED | officer1, then supervisor1 | file APPROVED, `closed_on` set |
| 10 | Record undertaking | officer1 | UNDERTAKING obligation OPEN; every institution user gets an in-app notification |
| 10 | Upload proof 1, officer rejects with a new date | institution1, officer1 | same obligation reopens: OPEN, level 0, new date; institution notified |
| 10 | Upload proof 2, officer accepts | institution1, officer1 | undertaking VERIFIED, obligation DONE, the job ignores it |
| 11 | Add the lease deed (valid 60 days) | institution1 | DOCUMENT obligation due on the expiry date |

## Audit trail checked at the end

`APPLICATION_CREATED` 1, `STAGE_COMPLETED` 4 (stages 1, 2, 5, 6), `EVC_SCHEDULED` 1, `EVC_COMPLETED` 1,
`UNDERTAKING_RECORDED` 1, `PROOF_UPLOADED` 2 or more, `DOCUMENT_CREATED` 1, `ALERT_*` 14. The test deletes everything
it created, so `npm run seed:check` still prints DEMO NUMBERS OK.