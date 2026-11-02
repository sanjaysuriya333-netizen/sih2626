// Called from server.js only (never from tests). In production it refuses unsafe settings.
function findProblems(env = process.env) {
  const problems = [];
  const secret = env.JWT_SECRET || '';
  if (!secret || secret === 'change_me' || secret.length < 32) {
    problems.push('JWT_SECRET must be set, not "change_me", and at least 32 characters');
  }
  if (!env.CLIENT_ORIGIN) problems.push('CLIENT_ORIGIN must be set (the CORS allow-list)');
  if (!env.DATABASE_URL) problems.push('DATABASE_URL must be set');
  if (!['lax', 'strict', 'none'].includes((env.COOKIE_SAMESITE || 'lax').toLowerCase())) {
    problems.push('COOKIE_SAMESITE must be lax, strict or none');
  }
  return problems;
}

function checkConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const problems = findProblems(env);
  if (problems.length > 0) throw new Error(`Unsafe configuration:\n- ${problems.join('\n- ')}`);
}

module.exports = { checkConfig, findProblems };