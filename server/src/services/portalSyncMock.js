const fs = require('node:fs/promises');
const path = require('node:path');
const { importApplications } = require('./importService');

const SAMPLE_FILE = path.join(__dirname, '..', '..', 'samples', 'portal-sync.csv');

// Mock of the AICTE portal feed: reads a CSV in the same format as the import screen.
// A real adapter would fetch rows from the portal and hand the same rows to importApplications.
async function runPortalSync(user, filePath = SAMPLE_FILE) {
  const text = await fs.readFile(filePath, 'utf8');
  return importApplications(user, text, { source: 'portal-sync-mock' });
}

module.exports = { runPortalSync, SAMPLE_FILE };