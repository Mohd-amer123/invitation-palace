/**
 * Password Hashing & Verification Helper
 * Uses bcryptjs when available, and standard Node crypto fallback.
 * THE INVITATION PALACE
 */

const crypto = require('crypto');

let bcrypt = null;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = null;
}

function hashPassword(password) {
  if (bcrypt) {
    return bcrypt.hashSync(password, 10);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;

  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const originalHash = parts[2];
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return testHash === originalHash;
  }

  if (bcrypt) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch (e) {
      return false;
    }
  }

  return false;
}

module.exports = {
  hashPassword,
  verifyPassword
};
