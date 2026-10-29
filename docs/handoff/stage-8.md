# Stage 8 handoff: Channels, escalation and settings (Module F, part 2)
Owner: Sanjay Suriya   Date: 2026-10-29   Tag: stage-8-done

## Done
- Channel interface `channels.send(channel, user, message, ctx)` in `server/src/channels/index.js` with three adapters: `inAppChannel` (writes a notification row), `emailChannel` (Nodemailer, SMTP from env, or preview mode), `smsChannel` (stub that logs, provider table inside the file). The job never calls an adapter directly
- `notifyService.sendAlert` runs INSIDE the per-obligation transaction: IN_APP rows are written with `sent_on = now`, EMAIL and SMS rows with `sent_on = null`. After the transaction commits, `jobs/dailyCheck.js` calls `notifyService.dispatchPending(prisma, { obligationId })`, which sends the unsent EMAIL and SMS rows and sets `sent_on`. A rolled-back transition therefore never sends an email. Each row is claimed with a compare-and-set on `sent_on`, so two runs cannot send it twice
- A failed send leaves `sent_on` null, is logged with `console.error`, and never fails the run
- Escalation target unchanged from Stage 7 and now tested: the owner's `supervisor_id`, else the head-office user of the owner's region, else the first active head-office user
- Notifications API (own rows only, IN_APP only): list, unread count, mark one read, mark all read
- Notification bell in the top bar (unread count, polls every 30 seconds, dropdown with the 8 newest, mark all read), and a Notifications page (All / Unread tabs, pagination, mark read)
- Settings API and screen (HEAD_OFFICE only): edit `days_before` of each ladder step (both channels of a step move together), edit one rule's `active`, `channel` or `recipient_role`, edit the EVC minimum notice. Every change writes an audit row with before and after. Changes apply from the next daily run
- Email preview screen (HEAD_OFFICE only): lists EMAIL notification rows with recipient, subject and body, and shows the mail mode. Works with `MAIL_MODE=preview`, so the demo survives a blocked network
- Sidebar links for Settings (existed, now real) and Email preview

## Done test result
- Change a date, run the daily check, see the right alert reach the right person once, in-app and by email: <fill in: what you did, which user got it, what the Email preview and the bell showed>
- Edit a setting and see the next run change: <fill in: for example STAGE step 1 from 2 to 3, asOf used, what fired>. Also covered by tests/settings.test.js
- `npx vitest run --silent` in server/: <N> tests passed in <N> files (Step 1 alone was 233 in 21 files; fill in the final line)
- `npm run seed:check`: <fill in: DEMO NUMBERS OK after npm run reset>. Note: the count "due this week" read 12 on an old seed and 14 after `npm run reset`, because it depends on when the seed was made
- `npm run lint` clean in server/ and client/: <fill in>; `npm run build` in client/: <fill in>
- Fresh clone plus .env plus `npm run reset` plus `npm test`: <fill in>
- Real SMTP check with Mailtrap (optional): <fill in: done / not done>

## How to run
- After pulling: `npm install` in server/ and client/. No new migration in this stage
- New env vars (in `.env.example`): `MAIL_MODE` (`smtp` or `preview`; preview sends nothing by SMTP) and `SMS_PROVIDER` (default `stub`). `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` already existed
- `server/vitest.config` now sets `MAIL_MODE=preview` and `SMS_PROVIDER=stub` for all tests, so tests never send real mail
- Run every server command from `server\`
- To see real emails: set `MAIL_MODE=smtp` and the Mailtrap `SMTP_*` values in `.env`, restart the server, run the daily check from the Daily check page
- Running the daily check on the seed changes obligation states and the demo numbers until `npm run reset`

## How to switch SMS from the stub to a real gateway
1. Open `server/src/channels/smsChannel.js`
2. Add one entry to the `providers` object, for example `myGateway: { async send(user, message) { ... } }`. It must throw if the gateway refuses the message
3. Set `SMS_PROVIDER=myGateway` in `.env` and add any gateway keys to `.env.example` in the same commit
4. The users table has no phone number yet. A real provider needs a `phone` column on `users` (migration, seed, and a lookup in `dispatchPending`'s user select). Until then SMS rows only reach the stub
5. Nothing else changes: `sendAlert` and `dispatchPending` already treat SMS like EMAIL

## Settings keys
- `alert_rules` (per kind STAGE, EVC, UNDERTAKING, DOCUMENT): `days_before`, `channel` (IN_APP, EMAIL, SMS), `recipient_role` (OWNER, SUPERVISOR, HEAD_OFFICE), `active`. Rules with the same `days_before` form one step. "Escalation days" are the steps with negative `days_before` (-3 escalated, -7 reported)
- `evc_rules.min_notice_days` (working days, 0 to 30): the newest active row is the one `evcService.scheduleVisit` reads
- Env: `MAIL_MODE`, `SMS_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `DISABLE_CRON`

## Endpoints added (also in docs/api-contract.md)
- GET /api/notifications: all roles (own IN_APP rows): list, `unread`, `page`, `pageSize`
- GET /api/notifications/unread-count: all roles: `{ unread }`
- POST /api/notifications/:id/read: all roles (own rows): safe to repeat
- POST /api/notifications/read-all: all roles (own rows)
- GET /api/settings: HEAD_OFFICE: steps, rules and EVC notice
- PUT /api/settings/alert-steps/:kind: HEAD_OFFICE: new `days_before` for every step of a kind
- PATCH /api/settings/alert-rules/:id: HEAD_OFFICE: `active`, `channel` or `recipientRole` of one rule
- PATCH /api/settings/evc-min-notice: HEAD_OFFICE: `minNoticeDays`
- GET /api/email-preview: HEAD_OFFICE: EMAIL rows, `meta.mode` is `smtp` or `preview`

## Tables / enums / services added or changed
- No schema change, no migration
- `channels/index.js`, `inAppChannel.js`, `emailChannel.js` (has `setTransport` for tests), `smsChannel.js`: new
- `services/notifyService.js`: `sendAlert` now writes IN_APP through the channel interface and EMAIL/SMS rows unsent; new `dispatchPending`. `notifyInstitutionUsers` unchanged
- `jobs/dailyCheck.js`: calls `notifyService.dispatchPending` after each committed transition
- `services/notificationService.js`, `settingsService.js`, `emailPreviewService.js` and matching controllers and routes: new. Mounted in `routes/index.js` as `/notifications`, `/settings`, `/email-preview`
- Client: `NotificationBell.jsx`, `pages/Notifications.jsx`, `pages/Settings.jsx`, `pages/EmailPreview.jsx`, `utils/notificationEvents.js`; `TopBar.jsx`, `App.jsx`, `Sidebar.jsx` changed
- Audit actions: `SETTINGS_ALERT_STEPS_UPDATED`, `SETTINGS_ALERT_RULE_UPDATED`, `SETTINGS_EVC_MIN_NOTICE_UPDATED`
- Tests added: `channels.test.js`, `notifications.test.js`, `settings.test.js`, `emailPreview.test.js`. `dailyCheck.test.js`: the `notes` helper now counts IN_APP rows only

## Deviations from the plan
- Marking a notification as read writes no audit row (per-user noise). This is an exception to "every write is audited"
- The settings screen cannot add or remove ladder steps. It edits the days of existing steps, and deactivates or re-routes rules. Reason: `obligations.last_alert_level` stores a step position, so adding or removing a step would make stored levels point at the wrong step
- A step cannot lose its last active rule (409 `LAST_ACTIVE_RULE`), and a rule cannot be activated if that would create a step (409 `WOULD_ADD_STEP`). The DUE_TODAY step must stay 0 and values must be strictly descending
- Settings edits use dedicated endpoints under `/api/settings`, not a generic CRUD on `alert_rules`
- The email preview endpoint has its own route file `routes/emailPreview.js` (`routes/admin.js` was not changed)
- The email preview shows rows written by the platform. In `MAIL_MODE=preview` nothing is sent, so `sent_on` stays null for EMAIL rows; the row is still shown
- Institution notifications (`notifyInstitutionUsers`) stay IN_APP only
- Supervisor- or head-office-owned obligations: the SUPERVISOR recipient falls back to head office (accepted)

## Known issues / not done
- A failed EMAIL or SMS send is retried only the next time the same obligation has a transition (`dispatchPending` runs after a fired transition). If the obligation never reaches another step, the row stays unsent. A separate retry sweep in the daily job is not built
- SMS has no phone number to send to (no `phone` column on `users`); the stub only logs
- Email adapter: no retry, no queue, no bounce handling
- `docs/api-contract.md` still has stray rows from earlier stages that nothing implements: `GET /api/documents/expiring`, `POST /api/documents/renew`, `POST /api/documents/renewals/:id/confirm`, `GET /api/admin/daily-check-runs`, and duplicate rows for `POST /api/admin/run-daily-check` and `GET /api/evc`. Not cleaned up in this stage
- Changing the channel of a rule to one already used by another rule of the same step and recipient is allowed; the job de-duplicates per (user, channel), so the recipient still gets one message
- Notification bell polls every 30 seconds; there is no push
- Document obligations still alert on files that are REJECTED or CLOSED (from Stage 7)
- The Friday/Saturday working-day edge case from Stage 7 is unchanged
- Stage names, `max_days` and the 7-day notice are placeholders, not checked against the handbook
- No client tests; the browser walkthrough was done by hand
- Officer home "Documents expiring soon" widget: <fill in: added, or still not added (Stage 7 left this open)>
- Settings screen has no confirmation dialog and no undo; changing values back restores them

## Next owner: read these first
- `server/src/services/scope.js` (`scopeApplications`): every dashboard number must go through it
- `server/prisma/checkDemo.js` and `server/prisma/seed/applications.js`: they define how "in progress", "due this week", "overdue" and "escalated" are counted. The Stage 9 dashboards must give the same numbers on the seed
- `obligations` (state, due_date) and `applications.current_stage_id`, `stage_history` (entered_on, completed_on) for stage durations and ageing
- `client/src/pages/Home.jsx` and the per-role home pages, `components/StatusChip.jsx`, `hooks/useFetch.js`, `utils/format.js`
- `services/notifyService.js` (`sendAlert`, `dispatchPending`) and `channels/` if a report needs notification data
- RULES that still apply: every application query uses `where: { AND: [{ id }, scopeApplications(req.user)] }` (never spread the scope); every write calls `logAction` inside its transaction; every endpoint gets a row in `docs/api-contract.md`; new env vars go into `.env.example` in the same commit; client component files export only components; run all server commands from `server\`; tests that create data delete it afterwards so `npm run seed:check` still prints DEMO NUMBERS OK
-