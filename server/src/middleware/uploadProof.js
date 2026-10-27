const multer = require('multer');
const HttpError = require('../utils/httpError');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_NAME = /\.(pdf|jpe?g|png)$/i;

// Memory storage: nothing touches the disk until the service has checked the real file type
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_NAME.test(file.originalname)) {
      return cb(new HttpError(400, 'INVALID_FILE_TYPE', 'Only PDF, JPG and PNG files are accepted'));
    }
    cb(null, true);
  },
}).single('file');

// Turns multer errors into the standard error shape
module.exports = function uploadProof(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(400, 'FILE_TOO_LARGE', 'The file must be 10 MB or smaller'));
    }
    if (err instanceof multer.MulterError) {
      return next(new HttpError(400, 'INVALID_UPLOAD', 'Upload exactly one file in the "file" field'));
    }
    next(err);
  });
};