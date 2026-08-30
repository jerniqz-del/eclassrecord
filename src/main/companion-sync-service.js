const crypto = require('crypto');
const https = require('https');
const selfsigned = require('selfsigned');
const os = require('os');

const PROTOCOL_VERSION = 1;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionKey(secret) {
  return crypto.createHash('sha256').update(`eclass-companion-v1:${secret}`).digest();
}

function encryptJson(secret, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(secret), iv);
  cipher.setAAD(Buffer.from('eclass-companion-v1', 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    iv: base64url(iv),
    ciphertext: base64url(ciphertext),
    tag: base64url(cipher.getAuthTag())
  };
}

function decryptJson(secret, envelope) {
  if (!envelope || typeof envelope !== 'object') throw new Error('Encrypted envelope is required.');
  const iv = Buffer.from(String(envelope.iv || ''), 'base64url');
  const ciphertext = Buffer.from(String(envelope.ciphertext || ''), 'base64url');
  const tag = Buffer.from(String(envelope.tag || ''), 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('Encrypted envelope is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(secret), iv);
  decipher.setAAD(Buffer.from('eclass-companion-v1', 'utf8'));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

function localIpv4Addresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).flat().forEach((entry) => {
    if (!entry || entry.internal || entry.family !== 'IPv4') return;
    if (entry.address.startsWith('169.254.')) return;
    addresses.push(entry.address);
  });
  return [...new Set(addresses)];
}

function pairingPayload(status) {
  return [
    'ECLASS-COMPANION',
    PROTOCOL_VERSION,
    status.transport || 'wlan',
    status.host,
    status.port,
    status.sessionId,
    status.secret,
    status.certificateFingerprint,
    status.pin
  ].join('|');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function json(response, statusCode, value) {
  const payload = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(payload);
}

class CompanionSyncService {
  constructor({ onChanges, onToolCommand, onClientActivity } = {}) {
    this.server = null;
    this.status = null;
    this.snapshot = null;
    this.revision = 0;
    this.onChanges = onChanges;
    this.onToolCommand = onToolCommand;
    this.onClientActivity = onClientActivity;
    this.failedPins = new Map();
  }

  async start() {
    if (this.server && this.status?.transport === 'wlan') return this.publicStatus();
    if (this.status) await this.stop();
    const hosts = localIpv4Addresses();
    if (!hosts.length) throw new Error('Connect this computer to a private Wi-Fi network first.');
    this.status = {
      running: true,
      transport: 'wlan',
      host: hosts[0],
      availableHosts: hosts,
      port: 0,
      sessionId: crypto.randomUUID(),
      secret: base64url(crypto.randomBytes(32)),
      pin: String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
      startedAt: new Date().toISOString(),
      lastClientAt: ''
    };
    const notAfterDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pems = await selfsigned.generate([{ name: 'commonName', value: hosts[0] }], {
      keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notAfterDate,
      extensions: [
        { name: 'basicConstraints', cA: false, critical: true },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: hosts.map((address) => ({ type: 7, ip: address })).concat([{ type: 7, ip: '127.0.0.1' }]) }
      ]
    });
    this.status.certificateFingerprint = new crypto.X509Certificate(pems.cert).fingerprint256.replaceAll(':', '').toLowerCase();
    this.server = https.createServer({ key: pems.private, cert: pems.cert, minVersion: 'TLSv1.2' }, (request, response) => {
      this.handle(request, response).catch((error) => {
        json(response, error.statusCode || 500, { success: false, error: error.message || 'Sync request failed.' });
      });
    });
    this.server.on('error', () => {});
    await new Promise((resolve, reject) => {
      const onError = (error) => { this.server?.off('listening', resolve); reject(error); };
      this.server.once('error', onError);
      this.server.once('listening', () => { this.server?.off('error', onError); resolve(); });
      this.server.listen(0, '0.0.0.0');
    });
    this.status.port = this.server.address().port;
    return this.publicStatus();
  }

  async startBluetooth() {
    if (this.status?.transport === 'bluetooth') return this.publicStatus();
    if (this.status) await this.stop();
    this.status = {
      running: true,
      transport: 'bluetooth',
      host: 'bluetooth',
      availableHosts: [],
      port: 0,
      sessionId: crypto.randomUUID(),
      secret: base64url(crypto.randomBytes(32)),
      pin: String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
      certificateFingerprint: crypto.randomBytes(32).toString('hex'),
      startedAt: new Date().toISOString(),
      lastClientAt: ''
    };
    return this.publicStatus();
  }

  async stop() {
    const current = this.server;
    this.server = null;
    this.status = null;
    this.failedPins.clear();
    if (current) await new Promise((resolve) => current.close(resolve));
    return { running: false };
  }

  publicStatus() {
    if (!this.status) return { running: false };
    return {
      ...this.status,
      pairingPayload: pairingPayload(this.status),
      hasSnapshot: Boolean(this.snapshot),
      revision: this.revision
    };
  }

  publish(snapshot) {
    if (!snapshot || snapshot.format !== 'eclass-companion-snapshot') throw new Error('A valid companion snapshot is required.');
    const serialized = JSON.stringify(snapshot);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new Error('Companion snapshot exceeds the 2 MB live-sync limit.');
    this.snapshot = JSON.parse(serialized);
    this.revision += 1;
    return { revision: this.revision };
  }

  verify(request, rawBody = '') {
    if (!this.status) throw Object.assign(new Error('Companion service is stopped.'), { statusCode: 503 });
    const timestamp = String(request.headers['x-eclass-timestamp'] || '');
    const signature = String(request.headers['x-eclass-signature'] || '');
    const clientId = String(request.headers['x-eclass-client'] || '').trim().slice(0, 120);
    const numericTimestamp = Number(timestamp);
    if (!clientId || !Number.isFinite(numericTimestamp) || Math.abs(Date.now() - numericTimestamp) > REQUEST_CLOCK_SKEW_MS) {
      throw Object.assign(new Error('Companion request expired.'), { statusCode: 401 });
    }
    const canonical = [request.method, request.url, timestamp, sha256(rawBody)].join('\n');
    const expected = crypto.createHmac('sha256', this.status.secret).update(canonical).digest('hex');
    if (!safeEqual(signature, expected)) throw Object.assign(new Error('Companion authentication failed.'), { statusCode: 401 });
    this.status.lastClientAt = new Date().toISOString();
    this.onClientActivity?.({ clientId, at: this.status.lastClientAt });
    return clientId;
  }

  verifyPin(clientId, pin) {
    const record = this.failedPins.get(clientId) || { count: 0, blockedUntil: 0 };
    if (record.blockedUntil > Date.now()) throw Object.assign(new Error('Too many incorrect PIN attempts. Try again later.'), { statusCode: 429 });
    if (safeEqual(pin, this.status.pin)) {
      this.failedPins.delete(clientId);
      return;
    }
    record.count += 1;
    if (record.count >= 5) {
      record.count = 0;
      record.blockedUntil = Date.now() + 5 * 60 * 1000;
    }
    this.failedPins.set(clientId, record);
    throw Object.assign(new Error('The desktop PIN is incorrect.'), { statusCode: 403 });
  }

  async handle(request, response) {
    const url = new URL(request.url, 'https://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return json(response, 200, { service: 'eclass-companion', version: PROTOCOL_VERSION, running: Boolean(this.server) });
    }
    if (url.searchParams.get('session') !== this.status?.sessionId) {
      return json(response, 404, { success: false, error: 'Pairing session not found.' });
    }
    if (request.method === 'GET' && url.pathname === '/v1/snapshot') {
      const clientId = this.verify(request);
      const knownRevision = Number(url.searchParams.get('revision') || 0);
      if (!this.snapshot) return json(response, 503, { success: false, error: 'The desktop snapshot is not ready.' });
      if (knownRevision === this.revision) return json(response, 200, { success: true, unchanged: true, revision: this.revision });
      return json(response, 200, {
        success: true,
        unchanged: false,
        revision: this.revision,
        clientId,
        payload: encryptJson(this.status.secret, this.snapshot)
      });
    }
    if (request.method === 'POST' && url.pathname === '/v1/changes') {
      const rawBody = await readBody(request);
      const clientId = this.verify(request, rawBody);
      const body = JSON.parse(rawBody || '{}');
      const payload = decryptJson(this.status.secret, body.payload);
      this.verifyPin(clientId, String(payload.pin || ''));
      if (!Array.isArray(payload.changes) || payload.changes.length > 10000) throw Object.assign(new Error('Mobile changes are invalid.'), { statusCode: 400 });
      const result = await this.onChanges?.({ clientId, baseRevision: Number(payload.baseRevision || 0), changes: payload.changes });
      return json(response, 200, { success: true, result: result || { accepted: payload.changes.length } });
    }
    if (request.method === 'POST' && url.pathname === '/v1/tool-command') {
      const rawBody = await readBody(request);
      const clientId = this.verify(request, rawBody);
      const body = JSON.parse(rawBody || '{}');
      const payload = decryptJson(this.status.secret, body.payload);
      const result = await this.onToolCommand?.({ clientId, command: String(payload.command || ''), args: payload.args || {} });
      return json(response, 200, { success: true, result: result || { accepted: true } });
    }
    return json(response, 404, { success: false, error: 'Companion endpoint not found.' });
  }
}

module.exports = {
  CompanionSyncService,
  PROTOCOL_VERSION,
  decryptJson,
  encryptJson,
  localIpv4Addresses,
  pairingPayload,
  sessionKey,
  sha256
};
