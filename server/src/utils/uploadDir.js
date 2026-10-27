const fs = require('node:fs');
const path = require('node:path');

const SERVER_ROOT = path.resolve(__dirname, '../..'); // the server/ folder

// UPLOAD_DIR resolved to an absolute path (read at call time so tests can change it)
function getUploadRoot() {
  return path.resolve(SERVER_ROOT, process.env.UPLOAD_DIR || './uploads');
}

// Folder for proof files; created on first use. Never served statically.
function getProofsDir() {
  const dir = path.join(getUploadRoot(), 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Full path for a stored file name. Only our own generated names are accepted,
// so a name from the database can never walk out of the proofs folder.
function proofFilePath(storedName) {
  if (!/^[A-Za-z0-9-]+\.(pdf|jpg|png)$/.test(storedName)) {
    throw new Error('Invalid stored file name');
  }
  return path.join(getProofsDir(), storedName);
}

module.exports = { getUploadRoot, getProofsDir, proofFilePath };