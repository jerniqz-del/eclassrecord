/** Validation and printable-card helpers for offline PIN recovery QR images. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodeRecoveryQrPng(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match || match[1].length > 4 * 1024 * 1024) throw new Error('Invalid or oversized recovery QR image.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length < 64 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Recovery QR image is not a valid PNG file.');
  return buffer;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function createRecoveryQrPrintHtml(dataUrl, label) {
  decodeRecoveryQrPng(dataUrl);
  const safeLabel = escapeHtml(label || 'E-Class Record Profile');
  return `<!doctype html><html><head><meta charset="utf-8"><title>PIN Recovery QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#0f172a}img{width:420px;max-width:90%;image-rendering:pixelated}.warning{max-width:560px;margin:24px auto;padding:16px;border:2px solid #dc2626;border-radius:8px;color:#991b1b}small{display:block;margin-top:24px;color:#475569}</style></head><body><h1>E-Class Record PIN Recovery</h1><h2>${safeLabel}</h2><img src="${dataUrl}" alt="PIN recovery QR"><div class="warning"><strong>Keep this QR private.</strong><br>Anyone holding it can replace this profile's PIN.</div><small>Generated locally. No learner data is stored in this QR.</small></body></html>`;
}

module.exports = { decodeRecoveryQrPng, createRecoveryQrPrintHtml };
