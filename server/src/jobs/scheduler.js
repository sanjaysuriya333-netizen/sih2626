const cron = require('node-cron');
const { runDailyCheckAudited } = require('./dailyCheck');

const DAILY_CRON = '0 6 * * *'; // 06:00 every day
const TIMEZONE = 'Asia/Kolkata'; // IST

// The scheduled run: never throws, so a failed night does not stop the server
async function runScheduled() {
  try {
    const r = await runDailyCheckAudited({});
    console.log(`[daily check] asOf ${r.asOf}: checked ${r.checked}, fired ${r.fired}, failed ${r.failed}`);
    return r;
  } catch (e) {
    console.error('[daily check] failed', e);
    return null;
  }
}

// Called from server.js (never from app.js, so tests never start it).
// Two instances at once are safe: the job claims every transition with a compare-and-set.
function startScheduler() {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[daily check] cron disabled (DISABLE_CRON=true)');
    return null;
  }
  const task = cron.schedule(DAILY_CRON, runScheduled, { timezone: TIMEZONE });
  console.log('[daily check] scheduled every day at 06:00 IST');
  return task;
}

module.exports = { DAILY_CRON, TIMEZONE, runScheduled, startScheduler };