'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'eclass-app';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-elem 'self'",
  // Legacy HTML event attributes remain temporarily isolated from script
  // elements. Phase 2 removes all inline script blocks; later UI cleanup can
  // replace the existing declarative onclick attributes without weakening
  // script-src-elem.
  "script-src-attr 'none'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'none'",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  // School Cloud endpoints are user-configurable. Companion WLAN/hotspot
  // traffic remains in the main process, but http:/ws: are retained for
  // explicitly configured on-premise pilot relays.
  "connect-src 'self' https: http: wss: ws:"
].join('; ');

const SANDBOXED_GAME_CSP = [
  "default-src 'self' data: blob:",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "connect-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:"
].join('; ');

const CHANNEL_POLICIES = Object.freeze({
  'admin:authenticate': { maxBytes: 1024, maxCalls: 6, windowMs: 30_000 },
  'admin:has-gh-token': { maxBytes: 2048 },
  'security:unlock-profile': { maxBytes: 2048, maxCalls: 8, windowMs: 30_000 },
  'security:lock-profile': { maxBytes: 256 },
  'db:save': { maxBytes: 64 * 1024 * 1024, timeoutMs: 30_000 },
  'companion:wlan-start': { maxBytes: 2 * 1024 * 1024, maxCalls: 10, windowMs: 60_000, timeoutMs: 30_000 },
  'companion:bluetooth-start': { maxBytes: 2 * 1024 * 1024, maxCalls: 10, windowMs: 60_000, timeoutMs: 30_000 },
  'companion:apk-install-start': { maxBytes: 1024, maxCalls: 10, windowMs: 60_000, timeoutMs: 30_000 },
  'companion:apk-install-stop': { maxBytes: 256, timeoutMs: 15_000 },
  'companion:apk-install-status': { maxBytes: 256 },
  'companion:publish-snapshot': { maxBytes: 64 * 1024 * 1024, timeoutMs: 30_000 },
  'companion:mobile-update-refresh': { maxBytes: 1024, timeoutMs: 45_000 },
  'dialog:export-recovery-qr': { maxBytes: 16 * 1024 * 1024 },
  'dialog:print-recovery-qr': { maxBytes: 16 * 1024 * 1024 },
  'dialog:export-pdf': { maxBytes: 32 * 1024 * 1024, timeoutMs: 60_000 },
  'compute:decode-recovery-qr': { maxBytes: 72 * 1024 * 1024, timeoutMs: 20_000 },
  'link-preview:fetch': { maxBytes: 4096, timeoutMs: 15_000 },
  'updater:check': { maxBytes: 4096, timeoutMs: 60_000 },
  'updater:download': { maxBytes: 4096, timeoutMs: 10 * 60_000 },
  'school-cloud:configure': { maxBytes: 64 * 1024, timeoutMs: 30_000 },
  'school-cloud:activate': { maxBytes: 64 * 1024, timeoutMs: 30_000 },
  'school-cloud:bootstrap': { maxBytes: 64 * 1024, timeoutMs: 30_000 },
  'school-cloud:request': { maxBytes: 2 * 1024 * 1024, timeoutMs: 45_000 },
  'school-cloud:backup-profile': { maxBytes: 64 * 1024 * 1024, timeoutMs: 120_000 },
  'school-cloud:restore-profile': { maxBytes: 64 * 1024, timeoutMs: 120_000 }
});

const PROFILE_CHANNELS = new Set([
  'companion:wlan-start',
  'companion:bluetooth-start',
  'companion:apk-install-start',
  'companion:publish-snapshot',
  'companion:mobile-update-import',
  'dialog:export-grade-transfer',
  'dialog:export-advisory-reset-backup',
  'dialog:import-assessment-attachment',
  'attachment:open',
  'attachment:remove',
  'shared-sync:configure-folder',
  'shared-sync:write-head',
  'shared-sync:write-base',
  'shared-sync:create-restore-point'
]);

function registerAppScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  }]);
}

function resolveAppAsset(rendererRoot, requestUrl) {
  const parsed = new URL(requestUrl);
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.hostname !== APP_HOST || parsed.username || parsed.password || parsed.port) {
    throw new Error('Untrusted application URL.');
  }
  let relativePath;
  try {
    relativePath = decodeURIComponent(parsed.pathname).replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html';
  } catch (_error) {
    throw new Error('Malformed application asset path.');
  }
  if (relativePath.includes('\0')) throw new Error('Malformed application asset path.');
  const root = path.resolve(rendererRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Application asset escaped its approved root.');
  return target;
}

function registerAppProtocol({ protocol, net, rendererRoot }) {
  return protocol.handle(APP_SCHEME, async (request) => {
    if (!['GET', 'HEAD'].includes(String(request.method || 'GET').toUpperCase())) {
      return new Response('Method not allowed', { status: 405 });
    }
    try {
      const target = resolveAppAsset(rendererRoot, request.url);
      const response = await net.fetch(pathToFileURL(target).toString(), { method: request.method });
      const headers = new Headers(response.headers);
      if (target.toLowerCase().endsWith('.html')) {
        const relativeTarget = path.relative(path.resolve(rendererRoot), target).replace(/\\/g, '/');
        headers.set('Content-Security-Policy', relativeTarget.startsWith('games/') ? SANDBOXED_GAME_CSP : CONTENT_SECURITY_POLICY);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Referrer-Policy', 'no-referrer');
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (_error) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  });
}

function isTrustedAppUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === `${APP_SCHEME}:`
      && parsed.hostname === APP_HOST
      && !parsed.username
      && !parsed.password
      && !parsed.port;
  } catch (_error) {
    return false;
  }
}

function assertSafeExternalUrl(value) {
  const text = String(value || '');
  if (!text || text.length > 2048) throw new Error('Invalid external URL.');
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error('Invalid external URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('Only credential-free HTTPS links can be opened.');
  }
  return parsed.toString();
}

function configureWebContents(webContents, options = {}) {
  const allowDataMainFrame = options.allowDataMainFrame === true;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, targetUrl) => {
    const allowed = isTrustedAppUrl(targetUrl)
      || (allowDataMainFrame && String(targetUrl || '').startsWith('data:text/html'));
    if (!allowed) event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function trustedMainFrame(event, getMainWindow) {
  const window = getMainWindow();
  if (!window || window.isDestroyed?.()) return false;
  if (event.sender !== window.webContents || event.sender?.isDestroyed?.()) return false;
  const frame = event.senderFrame;
  const mainFrame = event.sender.mainFrame;
  if (!frame || !mainFrame || frame.frameTreeNodeId !== mainFrame.frameTreeNodeId) return false;
  return isTrustedAppUrl(frame.url || event.sender.getURL());
}

function validateValue(value, state, depth = 0) {
  if (depth > 24) throw new Error('IPC payload nesting is too deep.');
  if (value === null || value === undefined) return;
  const type = typeof value;
  if (type === 'string') {
    state.bytes += Buffer.byteLength(value, 'utf8');
    if (value.length > state.maxStringLength) throw new Error('IPC string is too long.');
    return;
  }
  if (type === 'number' || type === 'boolean') {
    state.bytes += 8;
    return;
  }
  if (type === 'bigint' || type === 'function' || type === 'symbol') throw new Error('Unsupported IPC payload value.');
  if (ArrayBuffer.isView(value)) {
    state.bytes += value.byteLength;
    return;
  }
  if (value instanceof ArrayBuffer) {
    state.bytes += value.byteLength;
    return;
  }
  if (state.seen.has(value)) throw new Error('Circular IPC payload.');
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > state.maxArrayLength) throw new Error('IPC array is too large.');
      value.forEach(item => validateValue(item, state, depth + 1));
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('IPC objects must be plain records.');
    const keys = Object.keys(value);
    if (keys.length > state.maxObjectKeys) throw new Error('IPC object has too many properties.');
    for (const key of keys) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error('Unsafe IPC property name.');
      state.bytes += Buffer.byteLength(key, 'utf8');
      validateValue(value[key], state, depth + 1);
    }
  } finally {
    state.seen.delete(value);
  }
}

function validateIpcPayload(channel, args) {
  const policy = CHANNEL_POLICIES[channel] || {};
  const state = {
    bytes: 0,
    seen: new WeakSet(),
    maxStringLength: policy.maxStringLength || Math.min(policy.maxBytes || DEFAULT_MAX_BYTES, 8 * 1024 * 1024),
    maxArrayLength: policy.maxArrayLength || 100_000,
    maxObjectKeys: policy.maxObjectKeys || 10_000
  };
  validateValue(args, state);
  if (state.bytes > (policy.maxBytes || DEFAULT_MAX_BYTES)) throw new Error(`IPC payload for ${channel} exceeds its size limit.`);
  if (channel === 'shell:open-external') assertSafeExternalUrl(args[0]);
  if (channel === 'bluetooth:auto-scan' && !/^[A-F0-9]{6}$/.test(String(args[0] || ''))) throw new Error('Invalid Bluetooth discovery tag.');
  if (channel === 'companion:changes-result' && !/^[a-f0-9-]{36}$/i.test(String(args[0] || ''))) throw new Error('Invalid companion request identifier.');
  return state.bytes;
}

function installIpcBoundary(ipcMain, { getMainWindow, isProfileUnlocked = () => true, logger = console }) {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const calls = new Map();

  function enforce(event, channel, args) {
    if (!trustedMainFrame(event, getMainWindow)) throw new Error(`Rejected untrusted IPC sender for ${channel}.`);
    if (PROFILE_CHANNELS.has(channel) && !isProfileUnlocked()) throw new Error('Unlock a desktop profile before using this feature.');
    validateIpcPayload(channel, args);
    const policy = CHANNEL_POLICIES[channel];
    if (!policy?.maxCalls) return policy;
    const now = Date.now();
    const key = `${event.sender.id}:${channel}`;
    const recent = (calls.get(key) || []).filter(timestamp => timestamp > now - policy.windowMs);
    if (recent.length >= policy.maxCalls) throw new Error('Too many requests. Please wait and try again.');
    recent.push(now);
    calls.set(key, recent);
    return policy;
  }

  ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, ...args) => {
    const policy = enforce(event, channel, args);
    const operation = Promise.resolve().then(() => listener(event, ...args));
    if (!policy?.timeoutMs) return operation;
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${channel} timed out safely.`)), policy.timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  });

  ipcMain.on = (channel, listener) => originalOn(channel, (event, ...args) => {
    try {
      enforce(event, channel, args);
      return listener(event, ...args);
    } catch (error) {
      logger.warn?.(error.message);
      return undefined;
    }
  });
}

function installPermissionPolicy(electronSession, getMainWindow, permissionService) {
  const trusted = (webContents, requestingOrigin) => {
    const window = getMainWindow();
    return Boolean(window && !window.isDestroyed?.()
      && webContents === window.webContents
      && isTrustedAppUrl(requestingOrigin || webContents?.getURL?.()));
  };
  const allowed = (webContents, permission, requestingOrigin, details = {}) => {
    if (!trusted(webContents, requestingOrigin)) return false;
    if (permission === 'bluetooth') return permissionService.allows('bluetooth');
    if (permission === 'media') {
      const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      return permissionService.allows('microphone')
        && mediaTypes.length > 0
        && mediaTypes.every(type => type === 'audio');
    }
    return false;
  };
  electronSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => (
    allowed(webContents, permission, requestingOrigin, details)
  ));
  electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const capability = permission === 'bluetooth' ? 'bluetooth' : permission === 'media' ? 'microphone' : '';
    callback(Boolean(capability)
      && allowed(webContents, permission, details?.requestingUrl, details)
      && permissionService.consume(capability));
  });
  electronSession.setDevicePermissionHandler(details => (
    details.deviceType === 'bluetooth'
      && permissionService.allows('bluetooth')
      && trusted(details.webContents, details.origin)
  ));
}

module.exports = {
  APP_ORIGIN,
  APP_SCHEME,
  CONTENT_SECURITY_POLICY,
  SANDBOXED_GAME_CSP,
  CHANNEL_POLICIES,
  assertSafeExternalUrl,
  configureWebContents,
  installIpcBoundary,
  installPermissionPolicy,
  isTrustedAppUrl,
  registerAppProtocol,
  registerAppScheme,
  resolveAppAsset,
  trustedMainFrame,
  validateIpcPayload
};
