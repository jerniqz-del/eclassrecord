'use strict';

const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { getSudoku } = require('sudoku-gen');
const { INSTALL_PORT, isPrivateIpv4 } = require('./mobile-apk-install-service');

function requireRecoveryPayload(payload) {
  const text = String(payload || '');
  if (!text.startsWith('ECLASS-RECOVERY|') || text.length > 2048) throw new Error('Invalid recovery QR payload.');
  return text;
}

function requireCompanionPayload(payload) {
  const text = String(payload || '');
  if (!text || text.length > 4096) throw new Error('Invalid companion QR payload.');
  if (text.startsWith('ECLASS-COMPANION|1|')) return text;
  try {
    const value = JSON.parse(text);
    const commonValid = value?.type === 'eclass-companion-pairing'
      && value.version === 2
      && /^[a-f0-9-]{36}$/i.test(String(value.desktopId || ''))
      && String(value.profileId || '').length > 0
      && /^[a-f0-9-]{36}$/i.test(String(value.pairingSessionId || ''))
      && /^[A-Za-z0-9_-]{32,128}$/.test(String(value.bootstrapSecret || ''))
      && Number.isFinite(Date.parse(String(value.expiresAt || '')))
      && ['wlan', 'bluetooth'].includes(value.transport);
    const transportValid = value.transport === 'wlan'
      ? Array.isArray(value.lan?.hosts)
        && value.lan.hosts.length > 0
        && value.lan.hosts.every(host => typeof host === 'string' && host.length <= 64)
        && Number.isInteger(value.lan?.port)
        && value.lan.port > 0
        && value.lan.port <= 65535
        && /^[a-f0-9]{64}$/i.test(String(value.lan?.certificateFingerprint || ''))
      : /^[A-F0-9]{6}$/.test(String(value.bluetooth?.discoveryTag || ''))
        && /^\d{6}$/.test(String(value.bluetooth?.transportPin || ''));
    if (commonValid && transportValid) return text;
  } catch (_error) {
    // Return the same generic error for malformed and unsupported payloads.
  }
  throw new Error('Invalid companion QR payload.');
}

function requireApkInstallUrl(payload) {
  const text = String(payload || '');
  if (!text || text.length > 256) throw new Error('Invalid Android install QR payload.');
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error('Invalid Android install QR payload.');
  }
  const loopback = parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'http:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || Number(parsed.port) !== INSTALL_PORT
    || (!isPrivateIpv4(parsed.hostname) && !loopback)
    || !/^\/install\/[A-Za-z0-9_-]{32,128}$/.test(parsed.pathname)) {
    throw new Error('Invalid Android install QR payload.');
  }
  return parsed.toString();
}

function qrOptions(kind) {
  return kind === 'recovery'
    ? { errorCorrectionLevel: 'H', type: 'image/png', width: 512, margin: 4, color: { dark: '#0f172a', light: '#ffffff' } }
    : { errorCorrectionLevel: 'M', type: 'image/png', width: 420, margin: 3, color: { dark: '#0f172a', light: '#ffffff' } };
}

async function generateCompanionQr(payload) {
  return QRCode.toDataURL(requireCompanionPayload(payload), qrOptions('companion'));
}

async function generateApkInstallQr(payload) {
  return QRCode.toDataURL(requireApkInstallUrl(payload), qrOptions('companion'));
}

async function generateRecoveryQr(payload) {
  return QRCode.toDataURL(requireRecoveryPayload(payload), qrOptions('recovery'));
}

function decodeRecoveryQrPixels({ data, width, height } = {}) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isInteger(safeWidth) || !Number.isInteger(safeHeight) || safeWidth < 21 || safeHeight < 21 || safeWidth * safeHeight > 16_777_216) {
    throw new Error('Recovery QR image dimensions are invalid.');
  }
  const pixels = new Uint8ClampedArray(data);
  if (pixels.length !== safeWidth * safeHeight * 4) throw new Error('Recovery QR image pixels are incomplete.');
  return jsQR(pixels, safeWidth, safeHeight, { inversionAttempts: 'attemptBoth' })?.data || '';
}

function generateSudoku(difficulty = 'medium') {
  const safeDifficulty = ['easy', 'medium', 'hard', 'expert'].includes(String(difficulty)) ? String(difficulty) : 'medium';
  const sudoku = getSudoku(safeDifficulty);
  return { puzzle: String(sudoku.puzzle || ''), solution: String(sudoku.solution || ''), difficulty: safeDifficulty };
}

module.exports = {
  decodeRecoveryQrPixels,
  generateApkInstallQr,
  generateCompanionQr,
  generateRecoveryQr,
  generateSudoku,
  requireApkInstallUrl,
  requireCompanionPayload,
  requireRecoveryPayload
};
