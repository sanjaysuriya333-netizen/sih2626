// Express 4 does not catch async errors, so wrap async handlers
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);