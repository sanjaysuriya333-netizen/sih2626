// Throw this anywhere; errorHandler turns it into the standard error shape
class HttpError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
module.exports = HttpError;