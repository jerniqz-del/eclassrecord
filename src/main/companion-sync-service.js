const crypto = require('crypto');
const https = require('https');
const selfsigned = require('selfsigned');
const os = require('os');
const fs = require('fs');
const dgram = require('dgram');
const companionIdentity = require('./companion-identity');

const DISCOVERY_PORT = 38472;
const DISCOVERY_MULTICAST = '239.255.77.77';
const SYNC_PORT = 38473;

const PROTOCOL_VERSION = 1;
const CURRENT_PROTOCOL_VERSION = 2;
const PAIRING_TTL_MS = 5 * 60 * 1000;
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

function pairingPayloadV2(status) {
  return JSON.stringify({
    type: 'eclass-companion-pairing',
    version: CURRENT_PROTOCOL_VERSION,
    desktopId: status.desktopId,
    desktopName: status.desktopName || os.hostname() || 'E-Class Record Desktop',
    profileId: status.profileId,
    profileName: status.profileName || 'Teacher profile',
    schoolYear: status.schoolYear || '',
    pairingSessionId: status.sessionId,
    bootstrapSecret: status.secret,
    expiresAt: status.pairingExpiresAt,
    transport: status.transport || 'wlan',
    lan: status.transport === 'wlan' ? {
      hosts: status.availableHosts?.length ? status.availableHosts : [status.host].filter(Boolean),
      port: status.port,
      certificateFingerprint: status.certificateFingerprint
    } : null,
    bluetooth: status.transport === 'bluetooth' ? {
      discoveryTag: String(status.sessionId || '').replaceAll('-', '').slice(0, 6).toUpperCase(),
      transportPin: String(status.pin || '')
    } : null
  });
}

function normalizePairingContext(value = {}) {
  const profileId = String(value.profileId || '').trim().slice(0, 160);
  if (!profileId) throw new Error('Open an E-Class Record profile before creating a companion QR.');
  return {
    profileId,
    profileName: String(value.profileName || 'Teacher profile').trim().slice(0, 160),
    schoolYear: String(value.schoolYear || '').trim().slice(0, 40),
    desktopName: String(value.desktopName || os.hostname() || 'E-Class Record Desktop').trim().slice(0, 160)
  };
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

function isUsableTlsIdentity(value) {
  try {
    if (!value || !/^[a-f0-9]{64}$/i.test(value.certificateFingerprint || '')) return false;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(value.secret || '')) return false;
    if (!value.privateKey || !value.certificate || !value.sessionId) return false;
    const certificate = new crypto.X509Certificate(value.certificate);
    return Date.parse(certificate.validTo) >= Date.now() + 24 * 60 * 60 * 1000;
  } catch (_error) {
    return false;
  }
}

class CompanionSyncService {
  constructor({
    onPair,
    onChanges,
    onToolCommand,
    onClientActivity,
    getMobileUpdate,
    identityPath = '',
    identityStorage = null,
    discoveryPort = DISCOVERY_PORT
  } = {}) {
    this.server = null;
    this.status = null;
    this.snapshot = null;
    this.revision = 0;
    this.onChanges = onChanges;
    this.onPair = onPair;
    this.onToolCommand = onToolCommand;
    this.onClientActivity = onClientActivity;
    this.getMobileUpdate = getMobileUpdate;
    this.identityPath = identityPath;
    this.identityStorage = identityStorage;
    this.memoryIdentity = null;
    this.commandLock = false;
    this.discoveryPort = discoveryPort;
    this.failedPins = new Map();
    this.snapshotWaiters = new Set();
    this.discoverySocket = null;
  }

  readStoredIdentity() {
    const stored = companionIdentity.read(this.identityPath, this.identityStorage);
    if (stored) this.memoryIdentity = stored;
    return stored || this.memoryIdentity || null;
  }

  persistIdentity(identity) {
    this.memoryIdentity = identity;
    if (!this.identityPath) return;
    const result = companionIdentity.write(this.identityPath, identity, this.identityStorage);
    if (!result.persisted && result.reason === 'safe-storage-unavailable') {
      try { if (fs.existsSync(this.identityPath)) fs.unlinkSync(this.identityPath); } catch (_error) {}
    }
  }

  async createTlsIdentity(hosts, existing = {}) {
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
    return {
      desktopId: existing.desktopId || crypto.randomUUID(),
      sessionId: existing.sessionId || crypto.randomUUID(),
      secret: existing.secret || base64url(crypto.randomBytes(32)),
      pin: existing.pin || String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
      certificateFingerprint: new crypto.X509Certificate(pems.cert).fingerprint256.replaceAll(':', '').toLowerCase(),
      privateKey: pems.private,
      certificate: pems.cert,
      port: Number(existing.port || 0)
    };
  }

  ensureDesktopId() {
    const existing = this.readStoredIdentity() || {};
    if (!/^[a-f0-9-]{36}$/i.test(String(existing.desktopId || ''))) existing.desktopId = crypto.randomUUID();
    if (!existing.sessionId) existing.sessionId = crypto.randomUUID();
    if (!existing.secret) existing.secret = base64url(crypto.randomBytes(32));
    this.persistIdentity(existing);
    return existing;
  }

  async start(pairingContext = {}) {
    const context = normalizePairingContext(pairingContext);
    if (this.server && this.status?.transport === 'wlan') {
      this.refreshPairingContext(context);
      return this.publicStatus();
    }
    if (this.status) await this.stop();
    const hosts = localIpv4Addresses();
    if (!hosts.length) throw new Error('Connect this computer to a private local network first.');
    let identity = this.readStoredIdentity();
    if (!isUsableTlsIdentity(identity)) {
      identity = await this.createTlsIdentity(hosts, identity || {});
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
      lastClientAt: '',
      linkRttMs: 0,
      linkStrength: 0,
      linkQuality: 'Waiting for phone'
    };
    if (!identity.desktopId) identity.desktopId = crypto.randomUUID();
    this.status.desktopId = identity.desktopId;
    this.refreshPairingContext(context);
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
    this.persistIdentity(identity);
    await this.startDiscovery();
    return this.publicStatus();
  }

  setCommandLock(locked) {
    this.commandLock = Boolean(locked);
  }

  async pauseDiscovery() {
    const discovery = this.discoverySocket;
    this.discoverySocket = null;
    if (!discovery) return;
    await new Promise((resolve) => {
      try { discovery.close(() => resolve()); } catch (_error) { resolve(); }
    });
  }

  async resumeAfterSleep() {
    if (!this.status || this.status.transport !== 'wlan' || !this.server) return this.publicStatus();
    const hosts = localIpv4Addresses();
    if (hosts.length) {
      this.status.host = hosts[0];
      this.status.availableHosts = hosts;
      this.status.networkInterfaces = localNetworkInterfaces();
    }
    await this.pauseDiscovery();
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

  async startBluetooth(pairingContext = {}) {
    const context = normalizePairingContext(pairingContext);
    if (this.status?.transport === 'bluetooth') {
      this.refreshPairingContext(context);
      return this.publicStatus();
    }
    if (this.status) await this.stop();
    const identity = this.ensureDesktopId();
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
    this.status.desktopId = identity.desktopId;
    this.refreshPairingContext(context);
    return this.publicStatus();
  }

  refreshPairingContext(context) {
    if (!this.status) return;
    this.status.profileId = context.profileId;
    this.status.profileName = context.profileName;
    this.status.schoolYear = context.schoolYear;
    this.status.desktopName = context.desktopName;
    this.status.pairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
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
      pairingPayloadV2: pairingPayloadV2(this.status),
      hasSnapshot: Boolean(this.snapshot),
      revision: this.revision
    };
  }

  publish(snapshot) {
    if (!snapshot || snapshot.format !== 'eclass-companion-snapshot') throw new Error('A valid companion snapshot is required.');
    const serialized = JSON.stringify(snapshot);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new Error('Companion snapshot exceeds the 2 MB live-sync limit.');
    this.snapshot = JSON.parse(serialized);
    if (this.status) {
      this.snapshot.desktopId = this.snapshot.desktopId || this.status.desktopId;
      this.snapshot.profileId = this.snapshot.profileId || this.status.profileId;
    }
    if (this.snapshot.profileId) this.status.profileId = String(this.snapshot.profileId);
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
    const linkRttMs = Math.max(0, Math.min(60000, Number(request.headers['x-eclass-link-rtt'] || 0) || 0));
    const linkStrength = Math.max(0, Math.min(100, Number(request.headers['x-eclass-link-strength'] || 0) || 0));
    const linkQuality = linkStrength >= 90 ? 'Excellent' : linkStrength >= 75 ? 'Strong' : linkStrength >= 55 ? 'Good' : linkStrength >= 30 ? 'Weak' : 'Poor';
    this.status.linkRttMs = linkRttMs;
    this.status.linkStrength = linkStrength;
    this.status.linkQuality = linkQuality;
    this.onClientActivity?.({ clientId, at: this.status.lastClientAt, linkRttMs, linkStrength, linkQuality });
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
    if (request.method === 'POST' && url.pathname === '/v2/pair') {
      if (Date.parse(this.status.pairingExpiresAt || '') < Date.now()) {
        return json(response, 410, { success: false, error: 'This pairing QR has expired. Generate a new QR.' });
      }
      const rawBody = await readBody(request);
      const clientId = this.verify(request, rawBody);
      const body = JSON.parse(rawBody || '{}');
      const payload = decryptJson(this.status.secret, body.payload);
      if (String(payload.profileId || '') !== String(this.status.profileId || '')) {
        return json(response, 403, { success: false, error: 'The pairing request is for a different profile.' });
      }
      const attempt = this.failedPins.get(clientId) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) {
        return json(response, 429, { success: false, error: 'Too many incorrect PIN attempts. Try again later.' });
      }
      const result = await this.onPair?.({
        clientId,
        desktopId: this.status.desktopId,
        profileId: this.status.profileId,
        profileName: this.status.profileName,
        schoolYear: this.status.schoolYear,
        authorizationPin: String(payload.authorizationPin || '')
      });
      if (!result?.authorized) {
        attempt.count += 1;
        if (attempt.count >= 5) {
          attempt.count = 0;
          attempt.blockedUntil = Date.now() + 5 * 60 * 1000;
        }
        this.failedPins.set(clientId, attempt);
        return json(response, 403, { success: false, error: String(result?.error || 'Incorrect profile PIN.') });
      }
      this.failedPins.delete(clientId);
      return json(response, 200, { success: true, result });
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
        protocolVersion: Number(payload.protocolVersion || 1),
        desktopId: String(payload.desktopId || this.status.desktopId || ''),
        profileId: String(payload.profileId || this.snapshot?.profileId || this.status.profileId || ''),
        batchId: String(payload.batchId || ''),
        baseRevision: Number(payload.baseRevision || 0),
        changes: payload.changes,
        liveSync: Boolean(payload.liveSync),
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
      if (this.commandLock) {
        return json(response, 403, { success: false, error: 'Unlock the desktop profile before using remote controls.' });
      }
      const rawBody = await readBody(request);
      const clientId = this.verify(request, rawBody);
      const requestedProfile = String(url.searchParams.get('profile') || '');
      if (requestedProfile && requestedProfile !== String(this.status.profileId || '')) {
        return json(response, 409, { success: false, error: 'Open the matching desktop profile before using remote controls.' });
      }
      const body = JSON.parse(rawBody || '{}');
      const payload = decryptJson(this.status.secret, body.payload);
      if (payload.profileId && String(payload.profileId) !== String(this.status.profileId || '')) {
        return json(response, 409, { success: false, error: 'The remote command belongs to another desktop profile.' });
      }
      const result = await this.onToolCommand?.({ clientId, profileId: this.status.profileId, command: String(payload.command || ''), args: payload.args || {} });
      return json(response, 200, { success: true, result: result || { accepted: true } });
    }
    return json(response, 404, { success: false, error: 'Companion endpoint not found.' });
  }
}

module.exports = {
  CompanionSyncService,
  PROTOCOL_VERSION,
  CURRENT_PROTOCOL_VERSION,
  decryptJson,
  encryptJson,
  isPrivateIpv4,
  localIpv4Addresses,
  localNetworkInterfaces,
  pairingPayload,
  pairingPayloadV2,
  sessionKey,
  sha256
};
