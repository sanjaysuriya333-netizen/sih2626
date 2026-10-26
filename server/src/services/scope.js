// Returns a Prisma `where` for applications. Every list/detail query must use it.
function scopeApplications(user) {
  switch (user.role) {
    case 'OFFICER':
      return { assignedOfficerId: user.id };
    case 'SUPERVISOR':
      // files of officers whose supervisor_id is this user
      return { assignedOfficer: { supervisorId: user.id } };
    case 'HEAD_OFFICE':
      return {};
    case 'INSTITUTION':
      return { institutionId: user.institutionId ?? -1 };
    default:
      return { id: -1 }; // unknown role sees nothing
  }
}

module.exports = { scopeApplications };