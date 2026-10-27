const multer = require('multer');
const HttpError = require('../utils/httpError');

const MAX_BYTES = 2 * 1024 * 1024;
// Windows often labels .csv files as application/vnd.ms-excel
const CSV_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];

const upload = multer({
  storage: multer.memoryStorage(), // CSVs are parsed, never saved to disk
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const okName = file.originalname.toLowerCase().endsWith('.csv');
    if (!okName || !CSV_TYPES.includes(file.mimetype)) {
      return cb(new HttpError(400, 'INVALID_FILE_TYPE', 'Only .csv files are accepted'));
    }
    cb(null, true);
  },
}).single('file');

// Turns multer errors into the standard error shape
module.exports = function uploadCsv(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(400, 'FILE_TOO_LARGE', 'The CSV must be 2 MB or smaller'));
    }
    if (err instanceof multer.MulterError) {
      return next(new HttpError(400, 'INVALID_UPLOAD', 'Upload exactly one file in the "file" field'));
    }
    next(err);
  });
};