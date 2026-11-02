# Demo script (5 minutes)

Flow of slide 6: submit an application, finish scrutiny, see the EVC alert, approve with an undertaking, upload proof,
trigger a lease-expiry escalation with "Run daily check now".

## Roles
Proposed assignment: swap freely, but keep one person per job. The Presenter and the Driver must be different people.

| Role | Who | Job |
| --- | --- | --- |
| Driver | Sanjay Suriya | Operates the four windows exactly as the steps say; the only person on the keyboard |
| Presenter | Kamalini | Speaks the lines below, never touches the keyboard |
| Closer | Vaidhavaroghini | Gives the last 20 seconds and the first answer to questions |
| Technical answers: rules engine, daily job, database | Arun | Answers architecture questions |
| Technical answers: security and testing | Sharvesh Kumar | Answers security, audit and test questions |
| Timekeeper and backup driver | Sanjay Vallavan | Calls the time, runs the local copy on the hotspot, switches to the backup when the Presenter says "backup" |

## Four windows (one browser session per role)
The session cookie is shared inside one browser, so logging in as a second user replaces the first. Use four separate sessions:
Chrome, Chrome incognito, Edge and Firefox. Keep the demo address in all four and log in before you start.

| Window | Account |
| --- | --- |
| 1 Chrome | `officer1@demo.test` |
| 2 Chrome incognito | `institution1@demo.test` |
| 3 Edge | `supervisor1@demo.test` |
| 4 Firefox | `head1@demo.test` |

Password for all: `Demo@1234`. Put `sample.pdf` on the desktop for the proof upload.

## Preparation (30 minutes before)
1. Reset the data (this restores the numbers and fresh dates):
   - Live: the Neon reset in `docs/deploy.md`, section 7. Local: `npm run reset` in `server\`.
   - `npm run seed:check` must print DEMO NUMBERS OK (128 / 14 / 6 / 2).
2. Open the live address and wait until the login page loads (this wakes Render and Neon). Log in in all four windows.
3. Check the lease: in window 1 (officer1), open Documents. APP-2026-0001 must show a Lease deed that expires in about 60 days. Write down its expiry date. The finale runs the daily check for that date plus 3 days.
   If APP-2026-0001 is not visible to officer1, use the officer who owns it and tell the Driver which account to use.
   Also note which supervisor owns that officer. The escalation at 4:25 reaches only that supervisor's bell, so window 3 must be logged in as that supervisor (`supervisor1@demo.test` if the officer is on their team).
4. Prepare "file B" (about 4 minutes), the file used for the approval, undertaking and proof steps:
   - Window 1: New application, any institution, New, UG. Complete the first two stages.
   - EVC page: schedule a visit on the earliest date the form allows (it names that date if you pick a too-early one). Then record the visit ("Visit done").
   - Complete "EVC report review". The file now waits at "Approval decision". Write down its code.
5. Do NOT run the daily check before the demo. After it runs, the dashboard numbers change until the next reset.
6. Close every other tab and notification, set the browser zoom to 110 percent and mute the phone.

## Script

| Time | Window | Driver does | Presenter says |
| --- | --- | --- | --- |
| 0:00 | 4 head1 | Show the head-office dashboard (cards 128 / 14 / 6 / 2, pending by region, bottleneck chart) | "AICTE files go through stages, EVC visits, undertakings and expiring documents, and today nobody is warned when one stalls. This is every file at a glance: 128 in progress, 14 due this week, 6 overdue, 2 escalated. Officers still decide. We only route, remind and escalate" |
| 0:50 | 1 officer1 | New application: institution, New, UG, submit. Show the route and the dated stages | "Submitting picks the route from rules in the database, not code, and dates every stage while skipping weekends and holidays. This one is Scrutiny plus EVC" |
| 1:20 | 1 officer1 | Open the file, Complete stage twice. Open the EVC page: the file is in the queue | "The officer finishes scrutiny. The file now enters the EVC queue by itself" |
| 1:50 | 1 officer1 | EVC page: schedule a visit on the earliest allowed date | "Scheduling enforces the minimum notice and creates an EVC obligation with reminders at 7, 3 and 1 days" |
| 2:20 | 4 head1 | Daily check > Run for today. Then window 1: open the bell and show the EVC reminder | "Every morning one job moves every obligation along the same ladder. We trigger it now. The officer gets the EVC reminder in the app, and the email is on the Email preview screen. Run it again and nothing is sent twice" |
| 3:00 | 3 supervisor1 | Open file B, Complete stage with APPROVED | "The supervisor approves. Approval can carry a promise" |
| 3:20 | 1 officer1 | File B > Record undertaking ("Appoint two more faculty members", due in 14 days) | "The officer records an undertaking. It becomes an obligation with its own reminders" |
| 3:40 | 2 institution1 | Promises page: upload `sample.pdf` for that promise | "The institution sees its promise and uploads proof online" |
| 4:00 | 1 officer1 | Verification page: open the proof, Accept | "The officer checks the proof and accepts it. A rejected proof would reopen the promise with a new date" |
| 4:10 | 4 head1 | Daily check > Run as of (lease expiry + 3 days) > Run | "Finally a lease that expires. We jump the clock to three days after its expiry" |
| 4:25 | 3 supervisor1 | Open the bell: "Escalated: Lease deed of APP-2026-0001". Window 4: Email preview shows the mail | "The lease has expired, the system escalated it to the supervisor, and a further step reports it to head office. Every step is in the audit log" |
| 4:40 | 4 head1 | Back to the dashboard | Closer: "Role-based scope on the server, an audit trail, 325 automated tests and an end-to-end test of this exact flow. Obligations in, one ladder, no file is forgotten. Thank you" |

Dry-run it with a timer. If a step runs long, cut the dashboard tour at 0:00 first, not the escalation at 4:10.

## After a rehearsal
The finale pushes every seeded obligation to a late state. Reset (see Preparation, step 1) and rebuild file B before the next run.

## If something goes wrong
The Timekeeper decides. Say "backup" out loud and switch calmly. Do not debug on stage.

| Problem | Do |
| --- | --- |
| Login page does not load or is slow (more than 20 seconds) | Wait once. Then switch to the local copy (`docs/deploy.md`, section 8). If that fails too, play the backup video |
| "Too many requests" (429) on login | Use the local copy |
| Dashboard numbers are not 128 / 14 / 6 / 2 | Someone ran the daily check or forgot the reset. Reset, then redo the preparation. If there is no time, skip the numbers and say "about 128" |
| Scheduling the EVC visit is rejected | Use the earliest date the message names |
| No EVC reminder in the bell after the daily check | Run the check once more for the next working day. Say "tomorrow's run" |
| Upload fails | Check that the file is a real PDF under 10 MB. Use `sample.pdf` |
| Wrong user shown in a window | The window was logged in as someone else. Log out and in as the right account |
| Both the live site and the local copy fail | Play the backup video with live voiceover |

## Questions you will be asked

| Question | Short answer |
| --- | --- |
| Does it replace the AICTE portal? | No. It sits beside it and tracks what happens after a file is submitted. Portal data comes in by CSV import, with a mock adapter for the feed |
| Who decides? | Officers and supervisors. The system never approves or rejects anything |
| How do you stop duplicate alerts? | Each obligation stores the last alert step. Running the job twice on one day sends nothing new. Tested |
| How are the rules changed without code? | Stages, day limits and routes are database rows, and head office edits alert timings and recipients on the Settings screen |
| Is the data safe? | Role and ownership are checked on the server for every request. HTTP-only session cookie, lockout, rate limits, validated input, uploads checked by file content, and an append-only audit log |
| How do you know the numbers are right? | Dashboard numbers equal direct SQL counts (`docs/verify-dashboards.sql`), and 5,000 applications load in under 3 seconds |
| What is not built? | Real SMS (a stub logs it), PDF export (CSV only), live portal sync, a client test suite. The day limits are placeholders until checked against the handbook |

## Rehearsal log (two timed runs before the event)
| Run | Total time | Where we lost time | What we changed |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |

Aim for 4:45 or less without hurrying. Reset the data between runs.
