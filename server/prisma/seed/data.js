const REGIONS = ['Region A', 'Region B', 'Region C', 'Region D'];
const INSTITUTION_TYPES = ['GOVERNMENT', 'PRIVATE', 'AUTONOMOUS'];

// Mirrors docs/routes.md. Stage entries are [stage_name, max_days, owner_role].
// max_days are PLACEHOLDER working-day values until checked against the handbook.
const ROUTES = [
  {
    name: 'Only scrutiny',
    stages: [
      ['Application received', 2, 'OFFICER'],
      ['Document scrutiny', 10, 'OFFICER'],
      ['Clarification from institution', 7, 'INSTITUTION'],
      ['Approval decision', 5, 'SUPERVISOR'],
    ],
  },
  {
    name: 'Scrutiny + EVC',
    stages: [
      ['Application received', 2, 'OFFICER'],
      ['Document scrutiny', 10, 'OFFICER'],
      ['EVC scheduling', 7, 'OFFICER'],
      ['EVC visit', 15, 'OFFICER'],
      ['EVC report review', 7, 'OFFICER'],
      ['Approval decision', 5, 'SUPERVISOR'],
    ],
  },
  {
    name: 'Only EVC',
    stages: [
      ['Application received', 2, 'OFFICER'],
      ['EVC scheduling', 7, 'OFFICER'],
      ['EVC visit', 15, 'OFFICER'],
      ['EVC report review', 7, 'OFFICER'],
      ['Approval decision', 5, 'SUPERVISOR'],
    ],
  },
  {
    name: 'EVC + SAC/SHC',
    stages: [
      ['Application received', 2, 'OFFICER'],
      ['EVC scheduling', 7, 'OFFICER'],
      ['EVC visit', 15, 'OFFICER'],
      ['EVC report review', 7, 'OFFICER'],
      ['SAC/SHC review', 10, 'HEAD_OFFICE'],
      ['Approval decision', 5, 'HEAD_OFFICE'],
    ],
  },
];

// Placeholder holidays (fixed-date ones). Edit later; this is data only.
const HOLIDAYS = [
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-12-25', 'Christmas'],
  ['2027-01-26', 'Republic Day'],
  ['2027-08-15', 'Independence Day'],
  ['2027-10-02', 'Gandhi Jayanti'],
];

// Days before the due date for reminders, per obligation kind (EVC: 7, 3 and 1 days)
const LEAD_DAYS = { STAGE: [2], EVC: [7, 3, 1], UNDERTAKING: [5], DOCUMENT: [30] };

// days_before: positive = before due date, 0 = on due date, negative = days AFTER due date
function buildAlertRules() {
  const rules = [];
  for (const [kind, leads] of Object.entries(LEAD_DAYS)) {
    for (const channel of ['EMAIL', 'IN_APP']) {
      for (const lead of leads) {
        rules.push({ kind, daysBefore: lead, level: 'REMINDER_SENT', channel, recipientRole: 'OWNER' });
      }
      rules.push({ kind, daysBefore: 0, level: 'DUE_TODAY', channel, recipientRole: 'OWNER' });
      rules.push({ kind, daysBefore: -1, level: 'OVERDUE', channel, recipientRole: 'OWNER' });
      rules.push({ kind, daysBefore: -3, level: 'ESCALATED', channel, recipientRole: 'SUPERVISOR' });
      rules.push({ kind, daysBefore: -7, level: 'REPORTED', channel, recipientRole: 'HEAD_OFFICE' });
    }
  }
  return rules;
}

// Mirrors the route selection table in docs/routes.md.
// Empty array = "any". Lowest priority number is checked first; first match wins.
const ROUTE_RULES = [
  { priority: 1, route: 'EVC + SAC/SHC', institutionTypes: [], newOrExisting: ['NEW'], programmeLevels: ['PG'] },
  { priority: 2, route: 'Scrutiny + EVC', institutionTypes: [], newOrExisting: ['NEW'], programmeLevels: ['UG', 'DIPLOMA'] },
  { priority: 3, route: 'Only EVC', institutionTypes: [], newOrExisting: ['EXISTING'], programmeLevels: ['PG'] },
  { priority: 4, route: 'Only scrutiny', institutionTypes: [], newOrExisting: ['EXISTING'], programmeLevels: ['UG', 'DIPLOMA'] },
];
// Stage names where a file enters the EVC queue (flag is stored on route_stages)
const EVC_ENTRY_STAGE_NAMES = ['EVC scheduling'];

module.exports = { REGIONS, INSTITUTION_TYPES, ROUTES, HOLIDAYS, ROUTE_RULES, buildAlertRules, EVC_ENTRY_STAGE_NAMES };
