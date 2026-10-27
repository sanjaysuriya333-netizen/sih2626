const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { proofFilePath } = require('../utils/uploadDir');

// Real type check by file signature (the file name and the browser's type are never trusted)
const TYPES = [
  { ext: 'pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return (
    TYPES.find((t) => buffer.length >= t.magic.length && t.magic.every((b, i) => buffer[i] === b)) || null
  );
}

// Writes the file under a random name (the user's file name is never used on disk)
async function writeProofFile(buffer, ext) {
  const storedName = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(proofFilePath(storedName), buffer, { flag: 'wx' });
  return storedName;
}

// Best effort: used to undo a write when the database part fails
async function removeProofFile(storedName) {
  try {
    await fs.unlink(proofFilePath(storedName));
  } catch {
    /* already gone */
  }
}

function typeForStoredName(storedName) {
  const ext = storedName.split('.').pop();
  return TYPES.find((t) => t.ext === ext) || null;
}

module.exports = { detectFileType, writeProofFile, removeProofFile, typeForStoredName };