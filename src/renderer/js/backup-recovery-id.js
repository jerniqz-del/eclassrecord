(function (globalScope) {
  'use strict';

  const PREFIX = 'ECR';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const GROUP_COUNT = 5;
  const GROUP_LENGTH = 4;

  function randomBytes(length) {
    if (globalScope.crypto?.getRandomValues) {
      return globalScope.crypto.getRandomValues(new Uint8Array(length));
    }
    if (typeof require === 'function') {
      return require('crypto').randomBytes(length);
    }
    throw new Error('Secure random number generation is unavailable.');
  }

  function generateBackupRecoveryId() {
    const bytes = randomBytes(GROUP_COUNT * GROUP_LENGTH);
    const characters = Array.from(bytes, byte => ALPHABET[byte & 31]).join('');
    const groups = characters.match(new RegExp(`.{1,${GROUP_LENGTH}}`, 'g'));
    return `${PREFIX}-${groups.join('-')}`;
  }

  function normalizeBackupRecoveryId(value) {
    const compact = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
    const expectedLength = PREFIX.length + (GROUP_COUNT * GROUP_LENGTH);
    if (compact.length !== expectedLength || !compact.startsWith(PREFIX)) return '';
    const characters = compact.slice(PREFIX.length);
    if (!Array.from(characters).every(character => ALPHABET.includes(character))) return '';
    return `${PREFIX}-${characters.match(new RegExp(`.{1,${GROUP_LENGTH}}`, 'g')).join('-')}`;
  }

  const api = {
    generateBackupRecoveryId,
    normalizeBackupRecoveryId,
    isValidBackupRecoveryId: value => Boolean(normalizeBackupRecoveryId(value))
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.BackupRecoveryId = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
