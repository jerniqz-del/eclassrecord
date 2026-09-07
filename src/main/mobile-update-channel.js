const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/jerniqz-del/eclassrecord/main/mobile-updates/stable/mobile-update.json';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_APK_BYTES = 300 * 1024 * 1024;

let lastCheckedAt = 0;
let lastEtag = '';
let refreshPromise = null;
let channelStatus = { state: 'idle', message: 'GitHub mobile updates have not been checked yet.', checkedAt: '' };

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeManifest(value) {
  const fileName = path.basename(String(value?.fileName || ''));
  const downloadUrl = String(value?.downloadUrl || '');
  const parsedUrl = new URL(downloadUrl);
  if (parsedUrl.protocol !== 'https:' || !['github.com', 'objects.githubusercontent.com'].includes(parsedUrl.hostname)) {
    throw new Error('The mobile APK download URL is not an approved GitHub address.');
  }
  if (!fileName.toLowerCase().endsWith('.apk')) throw new Error('The GitHub mobile update does not name an APK.');
  if (String(value.applicationId || value.packageName || '') !== 'com.example.eclassrecordmobile') {
    throw new Error('The GitHub update belongs to a different Android application.');
  }
  const versionCode = Number(value.versionCode);
  const size = Number(value.size);
  const minimumCompanionProtocol = Number(value.minimumCompanionProtocol || 2);
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error('The mobile update version code is invalid.');
  if (!Number.isFinite(size) || size < 1 || size > MAX_APK_BYTES) throw new Error('The mobile update size is invalid.');
  if (!Number.isInteger(minimumCompanionProtocol) || minimumCompanionProtocol < 1) {
    throw new Error('The minimum companion protocol is invalid.');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(value.sha256 || ''))) throw new Error('The mobile update checksum is invalid.');
  return {
    schemaVersion: 1,
    applicationId: 'com.example.eclassrecordmobile',
    versionCode,
    versionName: String(value.versionName || versionCode),
    fileName,
    size,
    sha256: String(value.sha256).toLowerCase(),
    minimumCompanionProtocol,
    publishedAt: String(value.publishedAt || ''),
    releaseNotes: String(value.releaseNotes || ''),
    downloadUrl
  };
}

async function fetchBytes(url, { etag = '', maximum = MAX_APK_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { 'User-Agent': 'E-Class-Record-Desktop', Accept: 'application/octet-stream' };
    if (etag) headers['If-None-Match'] = etag;
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (response.status === 304) return { notModified: true, etag };
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maximum) throw new Error('The GitHub mobile update exceeds the allowed size.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximum) throw new Error('The GitHub mobile update exceeds the allowed size.');
    return { bytes, etag: response.headers.get('etag') || '' };
  } finally {
    clearTimeout(timer);
  }
}

function cachedVersion(root) {
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(root, 'mobile-update.json'), 'utf8')).versionCode || 0);
  } catch (_error) {
    return 0;
  }
}

async function performRefresh(root, manifestUrl) {
  fs.mkdirSync(root, { recursive: true });
  const previousVersion = cachedVersion(root);
  const manifestResponse = await fetchBytes(manifestUrl, { etag: lastEtag, maximum: MAX_MANIFEST_BYTES });
  if (manifestResponse.notModified) {
    return { state: 'current', message: 'GitHub mobile update information is current.' };
  }
  const manifest = safeManifest(JSON.parse(manifestResponse.bytes.toString('utf8')));
  if (manifest.minimumCompanionProtocol > 2) {
    throw new Error('The newest mobile update requires a newer desktop companion protocol.');
  }
  if (manifest.versionCode < previousVersion) {
    lastEtag = manifestResponse.etag;
    return {
      state: 'current',
      message: `The cached Android build ${previousVersion} is newer than the GitHub channel. Keeping the cached update.`
    };
  }
  const target = path.join(root, manifest.fileName);
  const alreadyCached = fs.existsSync(target) && sha256(fs.readFileSync(target)) === manifest.sha256;
  if (!alreadyCached) {
    const apk = await fetchBytes(manifest.downloadUrl, { maximum: MAX_APK_BYTES });
    if (apk.bytes.length !== manifest.size) throw new Error('The downloaded mobile APK size does not match its manifest.');
    if (sha256(apk.bytes) !== manifest.sha256) throw new Error('The downloaded mobile APK checksum does not match its manifest.');
    const incoming = `${target}.incoming`;
    fs.writeFileSync(incoming, apk.bytes, { mode: 0o600 });
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.renameSync(incoming, target);
  }
  const localManifest = { ...manifest };
  delete localManifest.downloadUrl;
  const incomingManifest = path.join(root, 'mobile-update.json.incoming');
  fs.writeFileSync(incomingManifest, JSON.stringify(localManifest, null, 2), { mode: 0o600 });
  fs.renameSync(incomingManifest, path.join(root, 'mobile-update.json'));
  lastEtag = manifestResponse.etag;
  return {
    state: manifest.versionCode > previousVersion ? 'downloaded' : 'current',
    message: `Android ${manifest.versionName} (build ${manifest.versionCode}) is cached from GitHub.`,
    update: localManifest
  };
}

async function refresh(root, options = {}) {
  const force = Boolean(options.force);
  const manifestUrl = String(options.manifestUrl || process.env.ECLASS_MOBILE_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL);
  if (!force && Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) return channelStatus;
  if (refreshPromise) return refreshPromise;
  lastCheckedAt = Date.now();
  channelStatus = { ...channelStatus, state: 'checking', message: 'Checking GitHub for Android updates...' };
  refreshPromise = performRefresh(root, manifestUrl)
    .then(result => {
      channelStatus = { ...result, source: manifestUrl, checkedAt: new Date().toISOString() };
      return channelStatus;
    })
    .catch(error => {
      channelStatus = {
        state: fs.existsSync(path.join(root, 'mobile-update.json')) ? 'offline-cache' : 'error',
        message: `GitHub mobile update check paused: ${error.message}`,
        source: manifestUrl,
        checkedAt: new Date().toISOString()
      };
      return channelStatus;
    })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function status() {
  return { ...channelStatus };
}

module.exports = { DEFAULT_MANIFEST_URL, CHECK_INTERVAL_MS, safeManifest, refresh, status };
