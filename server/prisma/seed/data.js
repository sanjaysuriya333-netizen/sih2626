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

// Days before the due date for the first reminder, per obligation kind
const LEAD_DAYS = { STAGE: 2, EVC: 3, UNDERTAKING: 5, DOCUMENT: 30 };

// days_before: positive = before due date, 0 = on due date, negative = days AFTER due date
function buildAlertRules() {
  const rules = [];
  for (const [kind, lead] of Object.entries(LEAD_DAYS)) {
    for (const channel of ['EMAIL', 'IN_APP']) {
      rules.push({
        kind,
        daysBefore: lead,
        level: 'REMINDER_SENT',
        channel,
        recipientRole: 'OWNER',
      });
      rules.push({ kind, daysBefore: 0, level: 'DUE_TODAY', channel, recipientRole: 'OWNER' });
      rules.push({ kind, daysBefore: -1, level: 'OVERDUE', channel, recipientRole: 'OWNER' });
      rules.push({
        kind,
        daysBefore: -3,
        level: 'ESCALATED',
        channel,
        recipientRole: 'SUPERVISOR',
      });
      rules.push({
        kind,
        daysBefore: -7,
        level: 'REPORTED',
        channel,
        recipientRole: 'HEAD_OFFICE',
      });
    }
  }
  return rules;
}

module.exports = { REGIONS, INSTITUTION_TYPES, ROUTES, HOLIDAYS, buildAlertRules };
