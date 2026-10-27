// Placeholder: 7 working days minimum notice (editable in the Stage 8 settings screen)
async function seedEvcRules(prisma) {
  await prisma.evcRule.create({ data: { minNoticeDays: 7, active: true } });
}
module.exports = { seedEvcRules };