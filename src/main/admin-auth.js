const crypto = require('crypto');

const ADMIN_PASSPHRASE_SALT = Buffer.from('bd20b9d79133ebede5c4af07bac2b48f', 'hex');
const ADMIN_PASSPHRASE_HASH = Buffer.from('123e799db17795070c4c6fa744b7311127c363573c49c43f48d2e7657cabfa37', 'hex');

function verifyAdminPassphrase(value) {
  const candidate = crypto.scryptSync(String(value || ''), ADMIN_PASSPHRASE_SALT, ADMIN_PASSPHRASE_HASH.length);
  return candidate.length === ADMIN_PASSPHRASE_HASH.length
    && crypto.timingSafeEqual(candidate, ADMIN_PASSPHRASE_HASH);
}

module.exports = { verifyAdminPassphrase };
