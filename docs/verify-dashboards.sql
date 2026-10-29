-- Stage 9: direct SQL for every dashboard number.
-- Run (PowerShell, from the repo root):
--   psql -U postgres -d sih26262 -f docs\verify-dashboards.sql
-- "Today" is the IST date, like the daily job and the dashboards.
-- A STAGE obligation counts only for the stage the file is at now (ref_id = current_stage_id),
-- and only while the file is IN_PROGRESS. EVC, UNDERTAKING and DOCUMENT obligations always count.

\echo
\echo '== 1. Head office cards: in_progress, due_today, due_this_week, overdue, escalated, reported =='
WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
live AS (
  SELECT o.* FROM obligations o JOIN applications a ON a.id = o.application_id
  WHERE o.state <> 'DONE'
    AND (o.kind <> 'STAGE' OR (a.status = 'IN_PROGRESS' AND o.ref_id = a.current_stage_id))
)
SELECT
  (SELECT count(*) FROM applications WHERE status = 'IN_PROGRESS') AS in_progress,
  (SELECT count(*) FROM live, t WHERE live.kind = 'STAGE'
     AND live.state IN ('OPEN', 'REMINDER_SENT', 'DUE_TODAY') AND live.due_date::date = t.today) AS due_today,
  (SELECT count(*) FROM live, t WHERE live.kind = 'STAGE'
     AND live.state IN ('OPEN', 'REMINDER_SENT', 'DUE_TODAY')
     AND live.due_date::date BETWEEN t.today AND t.today + 6) AS due_this_week,
  (SELECT count(*) FROM live WHERE state = 'OVERDUE') AS overdue,
  (SELECT count(*) FROM live WHERE state = 'ESCALATED') AS escalated,
  (SELECT count(*) FROM live WHERE state = 'REPORTED') AS reported;

\echo
\echo '== 2. Open obligations by kind and state (summary.byKind) =='
WITH live AS (
  SELECT o.* FROM obligations o JOIN applications a ON a.id = o.application_id
  WHERE o.state <> 'DONE'
    AND (o.kind <> 'STAGE' OR (a.status = 'IN_PROGRESS' AND o.ref_id = a.current_stage_id))
)
SELECT kind, state, count(*) FROM live GROUP BY kind, state ORDER BY kind, state;

\echo
\echo '== 3. Applications by status (summary.byStatus and breakdown by=status) =='
SELECT status, count(*) FROM applications GROUP BY status ORDER BY count(*) DESC, status;

\echo
\echo '== 4. Pending by region (breakdown by=region): total, overdue, escalated =='
SELECT i.region AS label,
       count(*) AS total,
       count(*) FILTER (WHERE o.state = 'OVERDUE') AS overdue,
       count(*) FILTER (WHERE o.state IN ('ESCALATED', 'REPORTED')) AS escalated
FROM applications a
JOIN institutions i ON i.id = a.institution_id
LEFT JOIN obligations o ON o.application_id = a.id AND o.kind = 'STAGE'
     AND o.state <> 'DONE' AND o.ref_id = a.current_stage_id
WHERE a.status = 'IN_PROGRESS'
GROUP BY i.region ORDER BY total DESC, i.region;

\echo
\echo '== 5. Pending by stage name (breakdown by=stage) =='
SELECT s.stage_name AS label,
       count(*) AS total,
       count(*) FILTER (WHERE o.state = 'OVERDUE') AS overdue,
       count(*) FILTER (WHERE o.state IN ('ESCALATED', 'REPORTED')) AS escalated
FROM applications a
JOIN route_stages s ON s.id = a.current_stage_id
LEFT JOIN obligations o ON o.application_id = a.id AND o.kind = 'STAGE'
     AND o.state <> 'DONE' AND o.ref_id = a.current_stage_id
WHERE a.status = 'IN_PROGRESS'
GROUP BY s.stage_name ORDER BY total DESC, s.stage_name;

\echo
\echo '== 6. Pending by officer (breakdown by=officer; same shape for institution) =='
SELECT u.name AS label,
       count(*) AS total,
       count(*) FILTER (WHERE o.state = 'OVERDUE') AS overdue,
       count(*) FILTER (WHERE o.state IN ('ESCALATED', 'REPORTED')) AS escalated
FROM applications a
JOIN users u ON u.id = a.assigned_officer_id
LEFT JOIN obligations o ON o.application_id = a.id AND o.kind = 'STAGE'
     AND o.state <> 'DONE' AND o.ref_id = a.current_stage_id
WHERE a.status = 'IN_PROGRESS'
GROUP BY u.name ORDER BY total DESC, u.name;

\echo
\echo '== 7. Ageing buckets (calendar days since submitted_on, IN_PROGRESS only) =='
WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
d AS (
  SELECT GREATEST(0, t.today - a.submitted_on::date) AS days
  FROM applications a, t WHERE a.status = 'IN_PROGRESS'
)
SELECT CASE WHEN days <= 7 THEN '0-7 days'
            WHEN days <= 14 THEN '8-14 days'
            WHEN days <= 30 THEN '15-30 days'
            WHEN days <= 60 THEN '31-60 days'
            ELSE '61+ days' END AS bucket,
       count(*)
FROM d GROUP BY 1 ORDER BY min(days);

\echo
\echo '== 8. Average days per stage (stage-durations; closed stage_history rows) =='
SELECT s.stage_name,
       count(*) AS count,
       round(avg(extract(epoch FROM (h.completed_on - h.entered_on)) / 86400)::numeric, 1) AS avg_days
FROM stage_history h JOIN route_stages s ON s.id = h.stage_id
WHERE h.completed_on IS NOT NULL
GROUP BY s.stage_name ORDER BY min(s.order_no), s.stage_name;

\echo
\echo '== 9. Role scope: in-progress files seen by officer1, supervisor1 and institution1 =='
SELECT
  (SELECT count(*) FROM applications a
     WHERE a.status = 'IN_PROGRESS'
       AND a.assigned_officer_id = (SELECT id FROM users WHERE email = 'officer1@demo.test')) AS officer1,
  (SELECT count(*) FROM applications a JOIN users u ON u.id = a.assigned_officer_id
     WHERE a.status = 'IN_PROGRESS'
       AND u.supervisor_id = (SELECT id FROM users WHERE email = 'supervisor1@demo.test')) AS supervisor1,
  (SELECT count(*) FROM applications a
     WHERE a.status = 'IN_PROGRESS'
       AND a.institution_id = (SELECT institution_id FROM users WHERE email = 'institution1@demo.test')) AS institution1;

\echo
\echo '== 10. Reports: pending total = in_progress; overdue total = overdue + escalated + reported =='
WITH live AS (
  SELECT o.* FROM obligations o JOIN applications a ON a.id = o.application_id
  WHERE o.state IN ('OVERDUE', 'ESCALATED', 'REPORTED')
    AND (o.kind <> 'STAGE' OR (a.status = 'IN_PROGRESS' AND o.ref_id = a.current_stage_id))
)
SELECT (SELECT count(*) FROM applications WHERE status = 'IN_PROGRESS') AS pending_report_rows,
       (SELECT count(*) FROM live) AS overdue_report_rows,
       (SELECT count(*) FROM applications) AS compliance_report_files;