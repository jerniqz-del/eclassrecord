'use strict';

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { isPrivateIpv4, localIpv4Addresses, localNetworkInterfaces } = require('./companion-sync-service');

const INSTALL_PORT = 38474;
const INSTALL_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function landingHtml(update, token) {
  const version = escapeHtml(update.versionName || update.versionCode || 'mobile');
  const fileName = escapeHtml(update.fileName || 'E-Class-Record-Mobile.apk');
  const size = escapeHtml(formatSize(update.size));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Install E-Class Record Mobile</title>
</head>
<body style="font-family:Segoe UI,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1.25rem;color:#0f172a;line-height:1.5">
  <h1 style="font-size:1.4rem">Install E-Class Record Mobile</h1>
  <p>This computer is sharing a verified Android package on your local network. Version ${version} (${size}).</p>
  <p><a href="/install/${encodeURIComponent(token)}/apk" download="${fileName}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:.75rem 1.1rem;border-radius:.7rem;font-weight:700">Download APK</a></p>
  <ol>
    <li>Stay on the same Wi-Fi or phone hotspot as this desktop.</li>
    <li>Open the downloaded file and allow install from this source if Android asks.</li>
    <li>After install, open Mobile Sync on the desktop and scan the WLAN pairing QR from the app.</li>
  </ol>
  <p style="color:#64748b;font-size:.9rem">Do not share this link. It expires after 15 minutes or when the teacher stops the install QR.</p>
</body>
</html>`;
}

class MobileApkInstallService {
  constructor({ getMobileUpdate, generateQr, allowLocalhost = false } = {}) {
    this.getMobileUpdate = getMobileUpdate;
    this.generateQr = generateQr;
    this.allowLocalhost = allowLocalhost === true;
    this.server = null;
    this.token = '';
    this.expiresAt = 0;
    this.update = null;
    this.hosts = [];
    this.expireTimer = null;
  }

  advertisedHosts() {
    const hosts = localIpv4Addresses();
    if (hosts.length) return hosts;
    if (this.allowLocalhost) return ['127.0.0.1'];
    return [];
  }

  hostAllowed(header) {
    const hostname = String(header || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    if (!hostname) return false;
    if (this.allowLocalhost && (hostname === '127.0.0.1' || hostname === 'localhost')) return true;
    return this.hosts.includes(hostname);
  }

  tokenValid(candidate) {
    if (!this.token || Date.now() > this.expiresAt) return false;
    return TOKEN_PATTERN.test(candidate) && safeEqual(candidate, this.token);
  }

  publicStatus() {
    if (!this.server || !this.token || Date.now() > this.expiresAt) {
      return { running: false };
    }
    const host = this.hosts[0];
    const token = this.token;
    const url = `http://${host}:${INSTALL_PORT}/install/${token}`;
    const update = this.update || {};
    return {
      running: true,
      url,
      host,
      hosts: this.hosts.slice(),
      port: INSTALL_PORT,
      expiresAt: new Date(this.expiresAt).toISOString(),
      networkInterfaces: localNetworkInterfaces(),
      versionName: String(update.versionName || ''),
      versionCode: Number(update.versionCode || 0) || 0,
      fileName: String(update.fileName || ''),
      size: Number(update.size || 0) || 0
    };
  }

  send(response, statusCode, headers, body) {
    response.writeHead(statusCode, headers);
    response.end(body);
  }

  notFound(response) {
    this.send(response, 404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }, 'Not found.');
  }

  handle(request, response) {
    try {
      if (request.method !== 'GET') return this.notFound(response);
      if (!this.hostAllowed(request.headers.host)) return this.notFound(response);
      const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
      const landing = url.pathname.match(/^\/install\/([A-Za-z0-9_-]{32,128})$/);
      const apk = url.pathname.match(/^\/install\/([A-Za-z0-9_-]{32,128})\/apk$/);
      const token = landing?.[1] || apk?.[1] || '';
      if (!this.tokenValid(token) || !this.update?.path || !fs.existsSync(this.update.path)) return this.notFound(response);
      if (landing) {
        const html = landingHtml(this.update, token);
        return this.send(response, 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }, html);
      }
      const stat = fs.statSync(this.update.path);
      const fileName = String(this.update.fileName || 'E-Class-Record-Mobile.apk').replace(/[^a-zA-Z0-9._-]/g, '_');
      response.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="${fileName}"`
      });
      return fs.createReadStream(this.update.path).pipe(response);
    } catch (_error) {
      if (!response.headersSent) this.notFound(response);
    }
  }

  scheduleExpiry() {
    clearTimeout(this.expireTimer);
    const wait = Math.max(0, this.expiresAt - Date.now());
    this.expireTimer = setTimeout(() => {
      this.stop().catch(() => {});
    }, wait);
    this.expireTimer.unref?.();
  }

  async listen() {
    if (this.server) return;
    this.server = http.createServer((request, response) => this.handle(request, response));
    this.server.on('error', () => {});
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server = null;
        reject(error);
      };
      this.server.once('error', onError);
      this.server.listen(INSTALL_PORT, '0.0.0.0', () => {
        this.server.off('error', onError);
        resolve();
      });
    });
  }

  async start() {
    const update = this.getMobileUpdate?.();
    if (!update?.path || !fs.existsSync(update.path) || !String(update.fileName || '').toLowerCase().endsWith('.apk')) {
      throw new Error('Cache an Android update first. Use Check Updates Now or Import Mobile Update.');
    }
    const hosts = this.advertisedHosts();
    if (!hosts.length) throw new Error('Connect this computer to a private local network first.');
    await this.listen();
    this.update = update;
    this.hosts = hosts;
    this.token = crypto.randomBytes(32).toString('base64url');
    this.expiresAt = Date.now() + INSTALL_TTL_MS;
    this.scheduleExpiry();
    const status = this.publicStatus();
    const qrDataUrl = await this.generateQr(status.url);
    return { ...status, qrDataUrl };
  }

  async stop() {
    clearTimeout(this.expireTimer);
    this.expireTimer = null;
    this.token = '';
    this.expiresAt = 0;
    this.update = null;
    this.hosts = [];
    const current = this.server;
    this.server = null;
    if (!current) return { running: false };
    await new Promise((resolve) => current.close(() => resolve()));
    return { running: false };
  }
}

module.exports = {
  INSTALL_PORT,
  INSTALL_TTL_MS,
  MobileApkInstallService,
  isPrivateIpv4
};
