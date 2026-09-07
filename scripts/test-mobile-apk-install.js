'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  INSTALL_PORT,
  MobileApkInstallService
} = require('../src/main/mobile-apk-install-service');
const computeService = require('../src/main/compute-service');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

assert.strictEqual(INSTALL_PORT, 38474);
assert.throws(() => computeService.requireApkInstallUrl('https://192.168.1.20:38474/install/abcdefghijabcdefghijabcdefghijabcd'));
assert.throws(() => computeService.requireApkInstallUrl('http://8.8.8.8:38474/install/abcdefghijabcdefghijabcdefghijabcd'));
assert.throws(() => computeService.requireApkInstallUrl('http://192.168.1.20:38474/v1/mobile-update/apk'));
assert.throws(() => computeService.requireApkInstallUrl('http://192.168.1.20:38473/install/abcdefghijabcdefghijabcdefghijabcd'));
const validUrl = 'http://192.168.1.20:38474/install/abcdefghijabcdefghijabcdefghijabcd';
assert.strictEqual(computeService.requireApkInstallUrl(validUrl), validUrl);

const serviceSource = read('src', 'main', 'companion-sync-service.js');
const installSource = read('src', 'main', 'mobile-apk-install-service.js');
const mainSource = read('src', 'main', 'main.js');
const preload = read('src', 'main', 'preload.js');
const html = read('src', 'renderer', 'index.html');
const companion = read('src', 'renderer', 'js', 'mobile-sync-companion.js');
const installer = read('build', 'installer.nsh');

assert.match(installSource, /CREATE_SERVER|http\.createServer/);
assert.doesNotMatch(installSource, /this\.verify\(/);
assert.match(installSource, /\/install\/:token|\/install\/\$\{|\/install\/\(/);
assert.match(mainSource, /companion:apk-install-start/);
assert.match(preload, /startCompanionApkInstall/);
assert.match(html, /id="companionApkInstallPanel"[^>]*companion-js-hidden|class="companion-pairing companion-js-hidden" id="companionApkInstallPanel"/);
assert.doesNotMatch(html, /id="companionApkInstallPanel"[^>]*style=/);
assert.match(html, /id="companionQrModal"/);
assert.match(companion, /function startCompanionApkInstall/);
assert.match(companion, /openCompanionQrModal/);
assert.match(companion, /setCompanionDisplay\(document\.getElementById\('companionApkInstallPanel'\)/);
assert.match(installer, /localport=38474 remoteip=LocalSubnet/);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-apk-install-'));
const apkPath = path.join(temporaryRoot, 'E-Class-Record-Mobile-v9.9.9-test.apk');
const apkBytes = Buffer.from('signed test apk bytes for lan install qr');
fs.writeFileSync(apkPath, apkBytes);

function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port: INSTALL_PORT,
      path: urlPath,
      headers: { Host: headers.Host || '127.0.0.1:38474', ...headers }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.on('error', reject);
  });
}

(async () => {
  const missing = new MobileApkInstallService({
    allowLocalhost: true,
    getMobileUpdate: () => null,
    generateQr: async (url) => computeService.generateApkInstallQr(url)
  });
  await assert.rejects(() => missing.start(), /Cache an Android update first/);

  const service = new MobileApkInstallService({
    allowLocalhost: true,
    getMobileUpdate: () => ({
      path: apkPath,
      fileName: 'E-Class-Record-Mobile-v9.9.9-test.apk',
      versionName: '9.9.9-test',
      versionCode: 999,
      size: apkBytes.length
    }),
    generateQr: async (url) => computeService.generateApkInstallQr(url)
  });

  try {
    const started = await service.start();
    assert.strictEqual(started.running, true);
    assert.match(started.url, /^http:\/\/[\d.]+:38474\/install\/[A-Za-z0-9_-]{32,128}$/);
    assert.match(started.qrDataUrl, /^data:image\/png;base64,/);
    computeService.requireApkInstallUrl(started.url);

    const token = new URL(started.url).pathname.split('/')[2];
    const landing = await get(`/install/${token}`);
    assert.strictEqual(landing.statusCode, 200);
    assert.match(landing.headers['content-type'], /text\/html/);
    assert.match(landing.body.toString('utf8'), /Download APK/);
    assert.match(landing.body.toString('utf8'), new RegExp(`/install/${token}/apk`));

    const apk = await get(`/install/${token}/apk`);
    assert.strictEqual(apk.statusCode, 200);
    assert.strictEqual(apk.headers['content-type'], 'application/vnd.android.package-archive');
    assert.deepStrictEqual(apk.body, apkBytes);

    const wrong = await get('/install/not-the-real-token-value-0123456789abcd');
    assert.strictEqual(wrong.statusCode, 404);

    const pairedPath = await get('/v1/mobile-update/apk');
    assert.strictEqual(pairedPath.statusCode, 404);
  } finally {
    await service.stop();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log('Mobile APK LAN install QR tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
