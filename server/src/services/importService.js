const { z } = require('zod');
const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { parseCsv } = require('../utils/csv');
const { logAction } = require('./audit');
const applicationService = require('./applicationService');

const MAX_ROWS = 200;
const COLUMN_NAMES = {
  institutionid: 'institutionId',
  neworexisting: 'newOrExisting',
  programmelevel: 'programmeLevel',
  submittedon: 'submittedOn',
  assignedofficeremail: 'assignedOfficerEmail',
};
const REQUIRED_COLUMNS = ['institutionid', 'neworexisting', 'programmelevel'];

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-30
}

// Every cell arrives as a trimmed string; values are normalised before this runs
const rowSchema = z.object({
  institutionId: z.string().regex(/^[1-9]\d*$/, 'is required and must be a whole number above 0'),
  newOrExisting: z.string().refine((s) => s === 'NEW' || s === 'EXISTING', 'must be NEW or EXISTING'),
  programmeLevel: z.string().refine((s) => ['UG', 'PG', 'DIPLOMA'].includes(s), 'must be UG, PG or DIPLOMA'),
  submittedOn: z.string().refine((s) => s === '' || isRealDate(s), 'must be a real date written as YYYY-MM-DD'),
  assignedOfficerEmail: z.string().max(254, 'is too long'),
});

// Same assignment rules as POST /api/applications, checked per row
function checkOfficer(user, email, officersByEmail) {
  let officer = email ? officersByEmail.get(email) : null;
  if (user.role === 'SUPERVISOR' && officer && officer.supervisorId !== user.id) officer = null; // hide other teams
  if (email && !officer) {
    return { error: user.role === 'SUPERVISOR' ? 'No active officer in your team has this email' : 'No active officer has this email' };
  }
  if (user.role === 'OFFICER') {
    if (officer && officer.id !== user.id) return { error: 'Officers can only import files for themselves' };
    return { officerId: user.id };
  }
  if (!officer) return { error: 'is required for this role' };
  return { officerId: officer.id };
}

// Imports every valid row (each in its own transaction) and reports the rest.
async function importApplications(user, csvText, { source = 'csv-upload' } = {}) {
  const records = parseCsv(csvText);
  if (records.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'The file is empty');

  const header = records[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    const names = missing.map((c) => COLUMN_NAMES[c]);
    throw new HttpError(400, 'MISSING_COLUMNS', `Missing column(s): ${names.join(', ')}`, names);
  }

  // record index i is spreadsheet row i + 1 (header is row 1); fully blank rows are skipped
  const rows = [];
  records.forEach((rec, i) => {
    if (i > 0 && !rec.every((cell) => cell.trim() === '')) rows.push({ row: i + 1, rec });
  });
  if (rows.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'The file has a header but no data rows');
  if (rows.length > MAX_ROWS) {
    throw new HttpError(400, 'TOO_MANY_ROWS', `A file may have at most ${MAX_ROWS} rows (this one has ${rows.length})`);
  }

  const errors = [];
  const failedRows = new Set();
  const fail = (row, field, message) => {
    errors.push({ row, field, message });
    failedRows.add(row);
  };

  // Pass 1: shape of every row
  const candidates = [];
  for (const { row, rec } of rows) {
    const raw = {};
    for (const [lower, camel] of Object.entries(COLUMN_NAMES)) {
      const idx = header.indexOf(lower);
      raw[camel] = idx === -1 ? '' : (rec[idx] ?? '').trim();
    }
    raw.newOrExisting = raw.newOrExisting.toUpperCase();
    raw.programmeLevel = raw.programmeLevel.toUpperCase();
    raw.assignedOfficerEmail = raw.assignedOfficerEmail.toLowerCase();

    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fail(row, String(issue.path[0]), issue.message);
    } else {
      candidates.push({ row, value: parsed.data });
    }
  }

  // Pass 2: look things up once, then import row by row
  const institutionIds = [...new Set(candidates.map((c) => Number(c.value.institutionId)))];
  const emails = [...new Set(candidates.map((c) => c.value.assignedOfficerEmail).filter(Boolean))];
  const [institutions, officers] = await Promise.all([
    prisma.institution.findMany({ where: { id: { in: institutionIds } }, select: { id: true } }),
    emails.length > 0
      ? prisma.user.findMany({
          where: { email: { in: emails }, role: 'OFFICER', active: true },
          select: { id: true, email: true, supervisorId: true },
        })
      : [],
  ]);
  const knownInstitutions = new Set(institutions.map((i) => i.id));
  const officersByEmail = new Map(officers.map((o) => [o.email, o]));

  const created = [];
  for (const { row, value } of candidates) {
    const institutionId = Number(value.institutionId);
    let bad = false;
    if (!knownInstitutions.has(institutionId)) {
      fail(row, 'institutionId', 'Institution not found');
      bad = true;
    }
    const who = checkOfficer(user, value.assignedOfficerEmail, officersByEmail);
    if (who.error) {
      fail(row, 'assignedOfficerEmail', who.error);
      bad = true;
    }
    if (bad) continue;

    try {
      const result = await applicationService.createApplication(user, {
        institutionId,
        newOrExisting: value.newOrExisting,
        programmeLevel: value.programmeLevel,
        submittedOn: value.submittedOn ? new Date(`${value.submittedOn}T00:00:00Z`) : undefined,
        assignedOfficerId: who.officerId,
      });
      created.push({ row, id: result.id, appCode: result.appCode });
    } catch (e) {
      if (e instanceof HttpError) {
        fail(row, 'row', e.message);
      } else {
        console.error(e);
        fail(row, 'row', 'Could not import this row');
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);
  const result = { total: rows.length, imported: created.length, failed: failedRows.size, errors, created };

  await logAction({
    userId: user.id,
    action: 'APPLICATIONS_IMPORTED',
    entity: 'import',
    after: { source, total: result.total, imported: result.imported, failed: result.failed },
  });
  return result;
}

module.exports = { importApplications, MAX_ROWS };