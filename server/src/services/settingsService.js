const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const audit = require('./audit'); // called as audit.logAction so tests can spy on it
const { buildLadder } = require('./ladder');

const KINDS = ['STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT'];

// Ladder steps of one kind, each with ALL its rules (active or not), so the screen can show them
function stepsOf(kindRules) {
  return buildLadder(kindRules).map((s) => ({
    step: s.step,
    daysBefore: s.daysBefore,
    level: s.level,
    rules: kindRules
      .filter((r) => r.daysBefore === s.daysBefore)
      .map((r) => ({ id: r.id, channel: r.channel, recipientRole: r.recipientRole, active: r.active })),
  }));
}

const newestEvcRule = (db) => db.evcRule.findFirst({ where: { active: true }, orderBy: { id: 'desc' } });

async function getSettings() {
  const rules = await prisma.alertRule.findMany({ orderBy: { id: 'asc' } });
  const evc = await newestEvcRule(prisma);
  return {
    kinds: KINDS.map((kind) => ({ kind, steps: stepsOf(rules.filter((r) => r.kind === kind)) })),
    evcMinNoticeDays: evc ? evc.minNoticeDays : null,
  };
}

// Sets days_before of every step of one kind. `daysBefore` lists the new value of each step, in
// step order (largest first). The step count cannot change, so last_alert_level stays valid.
async function updateSteps(user, kind, daysBefore) {
  return prisma.$transaction(async (tx) => {
    const all = await tx.alertRule.findMany({ where: { kind }, orderBy: { id: 'asc' } });
    const current = stepsOf(all);
    const bad = (message) => new HttpError(400, 'VALIDATION_ERROR', message);

    if (daysBefore.length !== current.length) {
      throw bad(`${kind} has ${current.length} steps; send exactly ${current.length} values`);
    }
    for (let i = 1; i < daysBefore.length; i += 1) {
      if (daysBefore[i] >= daysBefore[i - 1]) throw bad('Values must be strictly descending (largest first)');
    }
    current.forEach((s, i) => {
      if (s.level === 'DUE_TODAY' && daysBefore[i] !== 0) throw bad('The DUE_TODAY step must stay 0');
    });

    // Rule ids per step are read BEFORE any update, so two steps can swap values safely
    const groups = current.map((s) => all.filter((r) => r.daysBefore === s.daysBefore).map((r) => r.id));
    const before = current.map((s) => s.daysBefore);
    for (let i = 0; i < current.length; i += 1) {
      if (daysBefore[i] !== before[i]) {
        await tx.alertRule.updateMany({ where: { id: { in: groups[i] } }, data: { daysBefore: daysBefore[i] } });
      }
    }
    const changed = daysBefore.some((v, i) => v !== before[i]);
    if (changed) {
      await audit.logAction(
        {
          userId: user.id,
          action: 'SETTINGS_ALERT_STEPS_UPDATED',
          entity: 'alert_rule',
          before: { kind, daysBefore: before },
          after: { kind, daysBefore },
        },
        tx,
      );
    }
    return { kind, changed, daysBefore };
  });
}

// Edits ONE rule: active, channel or recipient role. Never adds or removes a step.
async function updateRule(user, id, patch) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.alertRule.findUnique({ where: { id } });
    if (!rule) throw new HttpError(404, 'NOT_FOUND', 'Alert rule not found');

    if (patch.active !== undefined && patch.active !== rule.active) {
      const others = await tx.alertRule.count({
        where: { kind: rule.kind, daysBefore: rule.daysBefore, active: true, id: { not: id } },
      });
      if (!patch.active && others === 0) {
        throw new HttpError(409, 'LAST_ACTIVE_RULE', 'A step needs at least one active rule. Change its channel or recipient instead');
      }
      if (patch.active && others === 0) {
        throw new HttpError(409, 'WOULD_ADD_STEP', 'This rule belongs to a step that has no active rule; steps cannot be added here');
      }
    }

    const data = {};
    for (const key of ['active', 'channel', 'recipientRole']) if (patch[key] !== undefined) data[key] = patch[key];
    const pick = (r) => ({ active: r.active, channel: r.channel, recipientRole: r.recipientRole });
    const updated = await tx.alertRule.update({ where: { id }, data });
    await audit.logAction(
      {
        userId: user.id,
        action: 'SETTINGS_ALERT_RULE_UPDATED',
        entity: 'alert_rule',
        entityId: id,
        before: { kind: rule.kind, daysBefore: rule.daysBefore, ...pick(rule) },
        after: { kind: rule.kind, daysBefore: rule.daysBefore, ...pick(updated) },
      },
      tx,
    );
    return { id, kind: updated.kind, daysBefore: updated.daysBefore, ...pick(updated) };
  });
}

// The EVC minimum notice (working days) is read from the newest active evc_rules row
async function updateEvcMinNotice(user, minNoticeDays) {
  return prisma.$transaction(async (tx) => {
    const rule = await newestEvcRule(tx);
    if (!rule) throw new HttpError(404, 'NOT_FOUND', 'No active EVC rule');
    await tx.evcRule.update({ where: { id: rule.id }, data: { minNoticeDays } });
    await audit.logAction(
      {
        userId: user.id,
        action: 'SETTINGS_EVC_MIN_NOTICE_UPDATED',
        entity: 'evc_rule',
        entityId: rule.id,
        before: { minNoticeDays: rule.minNoticeDays },
        after: { minNoticeDays },
      },
      tx,
    );
    return { id: rule.id, minNoticeDays };
  });
}

module.exports = { KINDS, getSettings, updateSteps, updateRule, updateEvcMinNotice };