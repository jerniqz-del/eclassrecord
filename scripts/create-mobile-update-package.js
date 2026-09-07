const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle.kts'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s*=\s*(\d+)/)?.[1]);
const versionName = gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
if (!versionCode || !versionName) throw new Error('Android versionCode/versionName could not be read.');

const source = path.resolve(process.argv[2] || path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'));
if (!fs.existsSync(source)) throw new Error(`APK not found: ${source}`);
const outputDirectory = path.dirname(source);
const fileName = `E-Class-Record-Mobile-v${versionName}.apk`;
const releaseTag = `mobile-v${versionName}`;
const target = path.join(outputDirectory, fileName);
if (source !== target) fs.copyFileSync(source, target);
const bytes = fs.readFileSync(target);
const manifest = {
  schemaVersion: 1,
  applicationId: 'com.example.eclassrecordmobile',
  versionCode,
  versionName,
  fileName,
  downloadUrl: `https://github.com/jerniqz-del/eclassrecord/releases/download/${releaseTag}/${fileName}`,
  size: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  minimumCompanionProtocol: 2,
  publishedAt: new Date().toISOString(),
  releaseNotes: process.argv.slice(3).join(' ') || `E-Class Record Mobile ${versionName}`
};
const manifestPath = path.join(outputDirectory, 'mobile-update.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${manifestPath}`);
console.log(`APK: ${target}`);
