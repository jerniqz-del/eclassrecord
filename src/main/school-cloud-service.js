const crypto = require('crypto');

const ALLOWED_REQUESTS = [
  ['GET', /^\/v1\/me$/],
  ['POST', /^\/v1\/admin-session\/(activate|heartbeat)$/],
  ['POST', /^\/v1\/personnel-changes$/],
  ['GET', /^\/v1\/approvals(?:\?.*)?$/],
  ['POST', /^\/v1\/approvals\/[^/]+\/(decision|override)$/],
  ['POST', /^\/v1\/override-grants$/],
  ['GET', /^\/v1\/announcements$/],
  ['POST', /^\/v1\/announcements$/],
  ['POST', /^\/v1\/announcements\/[^/]+\/acknowledge$/],
  ['GET', /^\/v1\/notifications\/summary$/],
  ['POST', /^\/v1\/profile-backups$/],
  ['GET', /^\/v1\/profile-backups\/latest$/]
];

function normalizeActivationCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^ECR[A-F0-9]{32}$/.test(code)) throw new Error('Enter the personnel activation code issued by the ICT Coordinator.');
  return code;
}

function encryptEnvelope(payload, keyHex, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAAD(Buffer.from(String(purpose), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    aad: String(purpose)
  };
}

function decryptEnvelope(envelope, keyHex, purpose) {
  if (!envelope || envelope.algorithm !== 'AES-256-GCM' || envelope.aad !== String(purpose)) {
    throw new Error('The encrypted School Cloud payload is invalid.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(String(purpose), 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function deviceKeyMaterial() {
  const encryption = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' }
  });
  const signing = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' }
  });
  return {
    publicEncryptionKey: encryption.publicKey,
    publicSigningKey: signing.publicKey,
    privateKeys: { encryption: encryption.privateKey, signing: signing.privateKey }
  };
}

function normalizeEndpoint(value, allowLocalhost = false) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_error) {
    throw new Error('Enter a valid School Cloud address.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(allowLocalhost && local && parsed.protocol === 'http:')) {
    throw new Error('School Cloud requires a secure HTTPS address.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('School Cloud address must not contain credentials, query parameters, or fragments.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

function normalizeRelayRequest(value) {
  const method = String(value?.method || 'GET').trim().toUpperCase();
  const path = String(value?.path || '').trim();
  if (!path.startsWith('/v1/') || path.includes('://') || path.includes('..')) {
    throw new Error('School Cloud request path is invalid.');
  }
  if (!ALLOWED_REQUESTS.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path))) {
    throw new Error('School Cloud request is not allowed by the desktop security boundary.');
  }
  const serializedBody = value?.body === undefined ? undefined : JSON.stringify(value.body);
  if (serializedBody && Buffer.byteLength(serializedBody, 'utf8') > 1_800_000) {
    throw new Error('School Cloud request is too large.');
  }
  return { method, path, body: serializedBody };
}

function publicConnection(record) {
  if (!record) return null;
  return {
    endpoint: record.endpoint,
    deviceId: record.deviceId,
    user: record.user || null,
    configuredAt: record.configuredAt,
    hasSession: Boolean(record.sessionToken),
    hasDeviceKeys: Boolean(record.encryptedDevicePrivateKeys || record.devicePrivateKeys),
    storageMode: record.storageMode || 'local-only',
    lastBackupAt: record.lastBackupAt || null
  };
}

class SchoolCloudService {
  constructor(options = {}) {
    this.vault = options.vault;
    this.fetch = options.fetch || global.fetch;
    this.allowLocalhost = Boolean(options.allowLocalhost);
    if (!this.vault) throw new Error('School Cloud protected vault is required.');
    if (typeof this.fetch !== 'function') throw new Error('School Cloud network transport is unavailable.');
  }

  configure(schoolId, value) {
    const endpoint = normalizeEndpoint(value?.endpoint, this.allowLocalhost);
    const sessionToken = String(value?.sessionToken || '').trim();
    const deviceId = String(value?.deviceId || '').trim();
    if (!/^[a-fA-F0-9]{64}$/.test(sessionToken)) throw new Error('School Cloud session credential is invalid.');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId)) throw new Error('School Cloud device ID is invalid.');
    const record = {
      endpoint,
      sessionToken,
      deviceId,
      user: value.user && typeof value.user === 'object' ? JSON.parse(JSON.stringify(value.user)) : null,
      encryptedDevicePrivateKeys: String(value.encryptedDevicePrivateKeys || ''),
      configuredAt: new Date().toISOString()
    };
    this.vault.set(schoolId, record);
    return publicConnection(record);
  }

  status(schoolId) {
    return publicConnection(this.vault.get(schoolId));
  }

  connections() {
    return this.vault.list().map(schoolId => ({
      schoolId,
      ...publicConnection(this.vault.get(schoolId))
    }));
  }

  disconnect(schoolId) {
    return this.vault.remove(schoolId);
  }

  async bootstrap(value) {
    const endpoint = normalizeEndpoint(value?.endpoint, this.allowLocalhost);
    const installToken = String(value?.installToken || '').trim();
    const schoolId = String(value?.schoolId || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(schoolId)) throw new Error('A valid School Cloud ID is required.');
    if (installToken.length < 32 || installToken.length > 512) throw new Error('Enter the one-time setup token from the school Cloudflare deployment.');
    if (!/^[a-fA-F0-9]{64}$/.test(String(value?.contentKey || ''))) {
      throw new Error('The school recovery key is invalid. Generate a new recovery pack and try again.');
    }
    const schoolName = String(value?.schoolName || '').trim();
    const schoolEmail = String(value?.schoolEmail || '').trim().toLowerCase();
    const ictName = String(value?.ictName || '').trim();
    const headName = String(value?.headName || '').trim();
    if (!schoolName || !ictName || !headName || !/^[^\\s@]+@[^\\s@]+\\.deped\\.gov\\.ph$/.test(schoolEmail)) {
      throw new Error('Enter the school name, school DepEd email, ICT Coordinator, and School Head.');
    }
    const contentKey = String(value.contentKey).toLowerCase();
    const encrypt = item => encryptEnvelope(item, contentKey, 'school-cloud-bootstrap');
    const response = await this.fetch(`${endpoint}/v1/setup/bootstrap`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${installToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId,
        schoolEmail,
        schoolNameEnvelope: encrypt({ name: schoolName }),
        administrators: [
          { role: 'school-ict', displayNameEnvelope: encrypt({ name: ictName }) },
          { role: 'school-head', displayNameEnvelope: encrypt({ name: headName }) }
        ]
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'School Cloud setup could not be completed.');
    return { endpoint, schoolId, administrators: body.administrators || [] };
  }

  async activate(schoolId, value) {
    const id = String(schoolId || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error('A valid School Cloud ID is required.');
    const endpoint = normalizeEndpoint(value?.endpoint, this.allowLocalhost);
    const activationCode = normalizeActivationCode(value?.activationCode);
    const dataKey = crypto.createHash('sha256')
      .update(`eclassrecord-school-cloud-profile-v1|${id}|${activationCode}`, 'utf8').digest('hex');
    const deviceId = crypto.randomUUID().replace(/-/g, '');
    const keys = deviceKeyMaterial();
    const response = await this.fetch(`${endpoint}/v1/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId: id,
        activationCode,
        deviceId,
        platform: 'desktop',
        deviceLabelEnvelope: encryptEnvelope({ label: String(value?.deviceLabel || 'Desktop app').trim() || 'Desktop app' },
          dataKey, 'school-cloud-device-label'),
        publicEncryptionKey: keys.publicEncryptionKey,
        publicSigningKey: keys.publicSigningKey
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'School Cloud activation failed.');
    const record = {
      endpoint,
      sessionToken: body.token,
      deviceId: body.device?.id || deviceId,
      user: body.user || null,
      devicePrivateKeys: JSON.stringify(keys.privateKeys),
      profileDataKey: dataKey,
      storageMode: value?.storageMode === 'cloud-backup' ? 'cloud-backup' : 'local-only',
      configuredAt: new Date().toISOString()
    };
    this.vault.set(id, record);
    return { ...publicConnection(record), deviceLimits: body.deviceLimits, deviceCounts: body.deviceCounts };
  }

  async uploadProfileBackup(schoolId, database) {
    const record = this.vault.get(schoolId);
    if (!record?.profileDataKey || !record?.devicePrivateKeys) throw new Error('Activate School Cloud before creating an encrypted backup.');
    const envelope = encryptEnvelope(database, record.profileDataKey, 'school-cloud-profile-backup');
    const signingKey = crypto.createPrivateKey({ key: JSON.parse(record.devicePrivateKeys).signing, format: 'jwk' });
    const signature = crypto.sign('sha256', Buffer.from(JSON.stringify(envelope), 'utf8'), {
      key: signingKey,
      dsaEncoding: 'ieee-p1363'
    }).toString('base64');
    const result = await this.request(schoolId, {
      method: 'POST',
      path: '/v1/profile-backups',
      body: { envelope, signature, revision: Date.now() }
    });
    if (!result.ok) throw new Error(result.body?.message || 'School Cloud backup failed.');
    record.lastBackupAt = new Date().toISOString();
    this.vault.set(schoolId, record);
    return result.body;
  }

  async downloadProfileBackup(schoolId) {
    const record = this.vault.get(schoolId);
    if (!record?.profileDataKey) throw new Error('Activate School Cloud before restoring a backup.');
    const result = await this.request(schoolId, { method: 'GET', path: '/v1/profile-backups/latest' });
    if (!result.ok) throw new Error(result.body?.message || 'No School Cloud backup is available.');
    return { snapshot: result.body.snapshot, database: decryptEnvelope(
      result.body.snapshot?.envelope, record.profileDataKey, 'school-cloud-profile-backup'
    ) };
  }

  async request(schoolId, input) {
    const record = this.vault.get(schoolId);
    if (!record?.sessionToken) throw new Error('Connect this school to School Cloud first.');
    const request = normalizeRelayRequest(input);
    const response = await this.fetch(`${record.endpoint}${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${record.sessionToken}`,
        ...(request.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(request.body ? { body: request.body } : {})
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_error) {
      throw new Error('School Cloud returned an invalid response.');
    }
    return { ok: response.ok, status: response.status, body };
  }
}

module.exports = {
  ALLOWED_REQUESTS,
  SchoolCloudService,
  normalizeEndpoint,
  normalizeRelayRequest,
  publicConnection
};
