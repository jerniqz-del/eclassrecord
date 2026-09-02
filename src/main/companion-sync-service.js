const crypto = require('crypto');
const https = require('https');
const selfsigned = require('selfsigned');
const os = require('os');
const fs = require('fs');
const dgram = require('dgram');

const DISCOVERY_PORT = 38472;
const DISCOVERY_MULTICAST = '239.255.77.77';
const SYNC_PORT = 38473;

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

function isPrivateIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function localNetworkInterfaces() {
  const interfaces = [];
  Object.entries(os.networkInterfaces()).forEach(([name, entries]) => (entries || []).forEach((entry) => {
    if (!entry || entry.internal || entry.family !== 'IPv4') return;
    if (!isPrivateIpv4(entry.address)) return;
    const label = /wi-?fi|wlan|wireless/i.test(name) ? 'Wi-Fi' : /ethernet|local area|lan/i.test(name) ? 'Ethernet' : 'Local network';
    interfaces.push({ name, address: entry.address, type: label });
  }));
  const unique = interfaces.filter((item, index) => interfaces.findIndex((entry) => entry.address === item.address) === index);
  const physical = unique.filter((item) => item.type === 'Wi-Fi' || item.type === 'Ethernet');
  return physical.length ? physical : unique;
}

function localIpv4Addresses() {
  return localNetworkInterfaces().map((entry) => entry.address);
}

function pairingPayload(status) {
  return [
    'ECLASS-COMPANION',
    PROTOCOL_VERSION,
    status.transport || 'wlan',
    status.availableHosts?.length ? status.availableHosts.join(',') : status.host,
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

function runIdentityRead(identityPath) {
  try {
    const value = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    if (!value || !/^[a-f0-9]{64}$/i.test(value.certificateFingerprint || '')) return null;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(value.secret || '')) return null;
    if (!value.privateKey || !value.certificate || !value.sessionId) return null;
    const certificate = new crypto.X509Certificate(value.certificate);
    if (Date.parse(certificate.validTo) < Date.now() + 24 * 60 * 60 * 1000) return null;
    return value;
  } catch (_error) {
    return null;
  }
}

class CompanionSyncService {
  constructor({ onChanges, onToolCommand, onClientActivity, getMobileUpdate, identityPath = '', discoveryPort = DISCOVERY_PORT } = {}) {
    this.server = null;
    this.status = null;
    this.snapshot = null;
    this.revision = 0;
    this.onChanges = onChanges;
    this.onToolCommand = onToolCommand;
    this.onClientActivity = onClientActivity;
    this.getMobileUpdate = getMobileUpdate;
    this.identityPath = identityPath;
    this.discoveryPort = discoveryPort;
    this.failedPins = new Map();
    this.snapshotWaiters = new Set();
    this.discoverySocket = null;
  }

  async start() {
    if (this.server && this.status?.transport === 'wlan') return this.publicStatus();
    if (this.status) await this.stop();
    const hosts = localIpv4Addresses();
    if (!hosts.length) throw new Error('Connect this computer to a private local network first.');
    let identity = this.identityPath && fs.existsSync(this.identityPath)
      ? runIdentityRead(this.identityPath)
      : null;
    if (!identity) {
      const notAfterDate = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
      const pems = await selfsigned.generate([{ name: 'commonName', value: 'E-Class Record Desktop' }], {
        keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notAfterDate,
        extensions: [
          { name: 'basicConstraints', cA: false, critical: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
          { name: 'extKeyUsage', serverAuth: true },
          { name: 'subjectAltName', altNames: hosts.map((address) => ({ type: 7, ip: address })).concat([{ type: 7, ip: '127.0.0.1' }]) }
        ]
      });
      identity = {
        sessionId: crypto.randomUUID(),
        secret: base64url(crypto.randomBytes(32)),
        pin: String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
        certificateFingerprint: new crypto.X509Certificate(pems.cert).fingerprint256.replaceAll(':', '').toLowerCase(),
        privateKey: pems.private,
        certificate: pems.cert,
        port: 0
      };
    }
    this.status = {
      running: true,
      transport: 'wlan',
      host: hosts[0],
      availableHosts: hosts,
      networkInterfaces: localNetworkInterfaces(),
      discoveryPort: this.discoveryPort,
      port: Number(identity.port || 0),
      sessionId: identity.sessionId,
      secret: identity.secret,
      pin: identity.pin,
      certificateFingerprint: identity.certificateFingerprint,
      startedAt: new Date().toISOString(),
      lastClientAt: ''
    };
    this.server = https.createServer({ key: identity.privateKey, cert: identity.certificate, minVersion: 'TLSv1.2' }, (request, response) => {
      this.handle(request, response).catch((error) => {
        json(response, error.statusCode || 500, { success: false, error: error.message || 'Sync request failed.' });
      });
    });
    this.server.on('error', () => {});
    await new Promise((resolve, reject) => {
      const onError = (error) => { this.server?.off('listening', resolve); reject(error); };
      this.server.once('error', onError);
      this.server.once('listening', () => { this.server?.off('error', onError); resolve(); });
      this.server.listen(SYNC_PORT, '0.0.0.0');
    });
    this.status.port = this.server.address().port;
    identity.port = this.status.port;
    if (this.identityPath) {
      fs.mkdirSync(require('path').dirname(this.identityPath), { recursive: true });
      fs.writeFileSync(this.identityPath, JSON.stringify(identity), { mode: 0o600 });
    }
    await this.startDiscovery();
    return this.publicStatus();
  }

  async startDiscovery() {
    if (!this.status || this.status.transport !== 'wlan') return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.discoverySocket = socket;
    socket.on('message', (buffer, remote) => {
      try {
        const request = JSON.parse(buffer.toString('utf8'));
        if (request?.kind !== 'eclass-discover' || request.sessionId !== this.status?.sessionId) return;
        const nonce = String(request.nonce || '');
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(nonce)) return;
        const hosts = localIpv4Addresses();
        const fingerprint = this.status.certificateFingerprint;
        const canonical = [nonce, this.status.sessionId, this.status.port, hosts.join(','), fingerprint].join('|');
        const payload = Buffer.from(JSON.stringify({
          kind: 'eclass-discovery-result', version: PROTOCOL_VERSION,
          nonce, sessionId: this.status.sessionId, hosts, port: this.status.port,
          certificateFingerprint: fingerprint,
          interfaces: localNetworkInterfaces(),
          signature: crypto.createHmac('sha256', this.status.secret).update(canonical).digest('hex')
        }));
        socket.send(payload, remote.port, remote.address);
      } catch (_error) {
        // Ignore unauthenticated or malformed LAN discovery datagrams.
      }
    });
    socket.on('error', () => {});
    const bound = await new Promise((resolve) => {
      const onBindError = () => resolve(false);
      socket.once('error', onBindError);
      socket.bind(this.discoveryPort, '0.0.0.0', () => {
        socket.off('error', onBindError);
        resolve(true);
      });
    });
    if (!bound) {
      if (this.discoverySocket === socket) this.discoverySocket = null;
      try { socket.close(); } catch (_error) {}
      return;
    }
    for (const host of localIpv4Addresses()) {
      try { socket.addMembership(DISCOVERY_MULTICAST, host); } catch (_error) {}
    }
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
    for (const waiter of this.snapshotWaiters) {
      clearTimeout(waiter.timer);
      if (!waiter.response.writableEnded) json(waiter.response, 503, { success: false, error: 'Companion service stopped.' });
    }
    this.snapshotWaiters.clear();
    const discovery = this.discoverySocket;
    this.discoverySocket = null;
    if (discovery) await new Promise((resolve) => discovery.close(resolve));
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
    for (const waiter of [...this.snapshotWaiters]) {
      this.snapshotWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      if (!waiter.response.writableEnded) this.sendSnapshot(waiter.response, waiter.clientId);
    }
    return { revision: this.revision };
  }

  sendSnapshot(response, clientId) {
    return json(response, 200, {
      success: true,
      unchanged: false,
      revision: this.revision,
      clientId,
      payload: encryptJson(this.status.secret, this.snapshot)
    });
  }

  waitForSnapshot(request, response, clientId, knownRevision) {
    if (!this.snapshot) return json(response, 503, { success: false, error: 'The desktop snapshot is not ready.' });
    if (knownRevision !== this.revision) return this.sendSnapshot(response, clientId);
    const waiter = { response, clientId, timer: null };
    const finish = () => {
      if (!this.snapshotWaiters.delete(waiter)) return;
      clearTimeout(waiter.timer);
      if (!response.writableEnded) json(response, 200, { success: true, unchanged: true, revision: this.revision });
    };
    waiter.timer = setTimeout(finish, 25000);
    this.snapshotWaiters.add(waiter);
    request.once('close', finish);
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
      return this.sendSnapshot(response, clientId);
    }
    if (request.method === 'GET' && url.pathname === '/v1/events') {
      const clientId = this.verify(request);
      return this.waitForSnapshot(request, response, clientId, Number(url.searchParams.get('revision') || 0));
    }
    if (request.method === 'POST' && url.pathname === '/v1/changes') {
      const rawBody = await readBody(request);
      const clientId = this.verify(request, rawBody);
      const body = JSON.parse(rawBody || '{}');
      const payload = decryptJson(this.status.secret, body.payload);
      if (!Array.isArray(payload.changes) || payload.changes.length > 10000) throw Object.assign(new Error('Mobile changes are invalid.'), { statusCode: 400 });
      const result = await this.onChanges?.({
        clientId,
        baseRevision: Number(payload.baseRevision || 0),
        changes: payload.changes,
        authorizationPin: String(payload.authorizationPin || payload.pin || '')
      });
      return json(response, 200, { success: true, result: result || { accepted: payload.changes.length } });
    }
    if (request.method === 'GET' && url.pathname === '/v1/mobile-update') {
      this.verify(request);
      const update = await this.getMobileUpdate?.();
      if (!update?.path || !fs.existsSync(update.path)) return json(response, 404, { success: false, error: 'No mobile update is available on this desktop.' });
      const { path: _privatePath, ...publicUpdate } = update;
      return json(response, 200, { success: true, update: publicUpdate });
    }
    if (request.method === 'GET' && url.pathname === '/v1/mobile-update/apk') {
      this.verify(request);
      const update = await this.getMobileUpdate?.();
      if (!update?.path || !fs.existsSync(update.path)) return json(response, 404, { success: false, error: 'No mobile update is available on this desktop.' });
      const stat = fs.statSync(update.path);
      response.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="${String(update.fileName || 'E-Class-Record-Mobile.apk').replace(/[^a-zA-Z0-9._-]/g, '_')}"`
      });
      return fs.createReadStream(update.path).pipe(response);
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
  localNetworkInterfaces,
  pairingPayload,
  sessionKey,
  sha256
};
