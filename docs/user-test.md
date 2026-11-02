# User test (Stage 10A)

Goal: two people from outside the team each finish 5 tasks with no help. Where they hesitate, we fix the screen.
Claude cannot run this test. The 10A owner runs the sessions and fills in the sheets below.

## Before each session (10 minutes)
1. In `server\`: `npm run reset`, then `npm run seed:check` (DEMO NUMBERS OK). Start both servers (`npm run dev` in `server\` and `client\`).
2. Log in as `officer1@demo.test` and record an undertaking ("Appoint two more faculty members", due in 10 days) on a file of institution 1. Institution tester task 3 needs this.
3. Put a small `sample.pdf` (under 1 MB) on the desktop. It is the file the testers upload.
4. Use a laptop with a normal browser window. Do not open the other tester's account.
5. Open the notes sheet below. Start a timer per task.

## Rules for the observer
- Read the task aloud once. Then stay quiet. Do not point, hint, or say "try the menu".
- Ask the tester to think aloud ("say what you are looking at and what you expect").
- If the tester is stuck for 2 minutes, mark the task FAILED, show the answer, and move on.
- Never explain why a screen looks the way it does until the session ends.
- Testers are not in the team and have not seen the demo. Recruit one person per role below.

## Tester A: officer (log in as `officer1@demo.test`, password `Demo@1234`)
Say: "You work at AICTE. You check applications from colleges."

| # | Task (read aloud) | Done when |
| --- | --- | --- |
| A1 | "Find the files that are due today and tell me the name of the first one." | Tester names a file from the due-today list |
| A2 | "Open any file and tell me which stage it is at and when that stage is due." | Stage name and due date are said correctly |
| A3 | "Register a new application for any institution. It is a new college and a UG programme." | The new file appears in the list with a route and dated stages |
| A4 | "Mark the first stage of that new file as complete." | The file now shows the second stage as current |
| A5 | "You heard the system sent you an alert. Find it and read me the subject." | Tester opens the bell or Notifications page and reads a subject |

## Tester B: institution (log in as `institution1@demo.test`, password `Demo@1234`)
Say: "You work at a college that applied to AICTE."

| # | Task (read aloud) | Done when |
| --- | --- | --- |
| B1 | "Find your application and tell me which stage it is at." | Stage name said correctly |
| B2 | "You promised the officer something. Find that promise and tell me its due date." | Due date said correctly |
| B3 | "Upload the file `sample.pdf` as proof for that promise." | Status of the promise changes to submitted |
| B4 | "Which of your documents expire within the next 60 days?" | Tester names at least one document with its date |
| B5 | "Renew one of those documents. The new expiry should be one year later. Use `sample.pdf`." | A renewal is shown as waiting for the officer |

Optional extra for a third person: head office (`head1@demo.test`). H1 "Say how many files are overdue." H2 "Open the
settings and change when the first stage reminder is sent." H3 "Run the daily check for today and say how many alerts it sent."

## Observation sheet (one per tester per task)

```
Tester: ______  Role: ______  Date: ______  Observer: ______
Task: ___   Result: DONE / DONE WITH HESITATION / FAILED   Time (min:sec): ______
Where did they first look? ____________________________________
Wrong turns (pages or buttons they tried first): ________________
Hesitation > 10 seconds at: ____________________________________
What they said out loud (exact words if possible): _____________
Error messages seen (copy the text): ___________________________
Did they understand the result of their action? YES / NO
Screen to fix (page, element): _________________________________
Severity: 1 cosmetic, 2 slowed them down, 3 blocked them
```

### What to record when someone hesitates
- The screen name and the exact element they were looking at.
- What they expected to happen. Ask after the task: "What did you expect when you clicked that?"
- Words they used for things ("application" vs "file", "promise" vs "undertaking"). Wrong words point to wrong labels.
- Any error text, copied exactly.
- Whether the hesitation repeated on a second visit to the same screen.

## Summary table (fill in after both sessions)

| Task | Tester | Result | Time | Problem seen | Fix | Fixed? |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | | | | | | |
| A2 | | | | | | |
| A3 | | | | | | |
| A4 | | | | | | |
| A5 | | | | | | |
| B1 | | | | | | |
| B2 | | | | | | |
| B3 | | | | | | |
| B4 | | | | | | |
| B5 | | | | | | |

## Pass rule and fixing
- Pass: each tester finishes at least 4 of 5 tasks with no help, and no task has severity 3 left open.
- Fix every severity 3 and 2 item that is a label, order, button position or message change. Do not rebuild screens in 10A.
- Anything larger goes into `docs/handoff/stage-10a.md` under Known issues, with the observation sheet reference.
- After fixes, run `npm run lint` and `npm run build` in `client\`, then repeat only the failed tasks with a third person if time allows.
- Keep the filled sheets in `docs/user-test-results/` (names removed) and write the pass or fail count in the handoff note.
