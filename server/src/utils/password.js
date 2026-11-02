const MIN_LENGTH = 8;

// Returns an error message, or null when the password is acceptable.
// No endpoint sets a password yet; the seed and any future user-creation code must call this.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a digit';
  return null;
}

module.exports = { validatePassword, MIN_LENGTH };