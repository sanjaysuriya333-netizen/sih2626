# Wireframes: the 8 screens (text descriptions)

Use these to sketch on paper, photograph into `docs/wireframes/`, or build as is. Phone-width layouts stack the blocks vertically.

## 1. Login
- **Who:** everyone, before sign-in.
- **Layout:** centred card with the project name above it.
- **Elements:** email field, password field, Sign in button, error line under the button (wrong password, locked account).
- **After login:** redirect to the role's home screen.

## 2. Officer home
- **Who:** OFFICER.
- **Layout:** top bar (bell, name, logout); left sidebar; main area.
- **Main area:** three count cards (My files, Due today, Overdue); below them a table of assigned files (application, route, stage, next date, status chip) with filters; a "Documents expiring soon" panel on the right.

## 3. Application detail
- **Who:** OFFICER, SUPERVISOR, HEAD_OFFICE; INSTITUTION sees a read-only version.
- **Layout:** header with application code, institution, route and status chip.
- **Main area:** vertical stage timeline (done, current, upcoming, each with due date); a **Complete stage** button on the current stage; tabs for EVC visit, Undertakings, Documents and History (audit).

## 4. Supervisor view
- **Who:** SUPERVISOR.
- **Layout:** two count cards (Team overdue, Escalated); a table of team items grouped by officer.
- **Elements:** columns for application, officer, stage, days overdue, alert level; row click opens Application detail.

## 5. Head-office dashboard
- **Who:** HEAD_OFFICE.
- **Layout:** four count cards (In progress, Due this week, Overdue, Escalated).
- **Charts:** pending by region and stage, a bottleneck bar chart (average days per stage), ageing buckets. Filters for region, date range and stage; Export CSV button.

## 6. Institution portal
- **Who:** INSTITUTION.
- **Layout:** My applications table (route, stage, status); a Promises to submit panel (description, due date, Upload button); a Documents expiring panel with Renew button.

## 7. Undertaking page
- **Who:** INSTITUTION to upload, OFFICER to verify.
- **Institution side:** promise description, due date, file picker (PDF, JPG, PNG, up to 10 MB), Upload button, status chip.
- **Officer side:** proof preview, Accept and Reject buttons, remarks box (required on reject), new due date picker shown on reject.

## 8. Settings
- **Who:** HEAD_OFFICE only.
- **Layout:** tabs per obligation kind (Stage, EVC, Undertaking, Document).
- **Elements:** table of alert rules with editable days before, escalation days, channel (in-app, email, SMS) and recipient role; Save button; note that changes apply from the next daily run.
