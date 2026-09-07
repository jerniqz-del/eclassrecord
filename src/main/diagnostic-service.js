'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_LOG_FILES = 5;
const CRASH_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function redact(value) {
  let text = String(value ?? '');
  const replacements = [
    [/\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{12,})?\b/gi, '[REDACTED_TOKEN]'],
    [/\b(?:pin|passcode|password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED_CREDENTIAL]'],
    [/\b[A-Fa-f0-9]{64}\b/g, '[REDACTED_DIGEST]'],
    [/[A-Za-z]:\\(?:[^\r\n<>:"|?*]+\\)*[^\r\n<>:"|?*]*/g, '[REDACTED_PATH]'],
    [/\\\\[^\s\\]+\\[^\r\n]*/g, '[REDACTED_PATH]'],
    [/\b\d{12}\b/g, '[REDACTED_LRN]'],
    [/\b\d{6}\b/g, '[REDACTED_PIN]'],
    [/TEST DATA(?:\s|—|-)*NOT FOR OFFICIAL USE/gi, '[REDACTED_TEST_MARKER]'],
    [/\b(?:teacherName|firstName|middleName|lastName|learnerName|grades?|scores?|profiles?|assignments?)\s*[:=]\s*(?:\\?"(?:\\.|[^"\\])*\\?"|[^,\r\n}]+)/gi, '[REDACTED_FIELD]'],
    [/"(?:teacherName|firstName|middleName|lastName|learnerName|grades?|scores?|profiles?|assignments?)"\s*:\s*(?:"(?:\\.|[^"])*"|\[[^\]]*\]|\{[^}]*\})/gi, '"[REDACTED_FIELD]"']
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.slice(0, 8000);
}

function safeJson(value) {
  try {
    return redact(JSON.stringify(value));
  } catch (_error) {
    return '[UNSERIALIZABLE]';
  }
}

class DiagnosticService {
  constructor(options = {}) {
    this.root = path.resolve(options.root);
    this.crashRoot = path.resolve(options.crashRoot || path.join(this.root, 'crashes'));
    this.logPath = path.join(this.root, 'main.log');
    this.preferencesPath = path.join(this.root, 'preferences.json');
    this.maxLogBytes = Number(options.maxLogBytes) || MAX_LOG_BYTES;
    this.maxLogFiles = Number(options.maxLogFiles) || MAX_LOG_FILES;
    fs.mkdirSync(this.root, { recursive: true });
    fs.mkdirSync(this.crashRoot, { recursive: true });
    this.prune();
  }

  preferences() {
    try {
      const value = JSON.parse(fs.readFileSync(this.preferencesPath, 'utf8'));
      return { enabled: value.enabled !== false };
    } catch (_error) {
      return { enabled: true };
    }
  }

  setEnabled(enabled) {
    const preferences = { enabled: enabled !== false, updatedAt: new Date().toISOString() };
    this.atomicWrite(this.preferencesPath, JSON.stringify(preferences, null, 2));
    return this.policy();
  }

  policy() {
    return {
      enabled: this.preferences().enabled,
      collection: 'Local crash dumps and bounded diagnostic event logs only.',
      automaticUpload: false,
      supportBundleIncludesCrashDumps: false,
      retentionDays: 14,
      maximumLogFiles: this.maxLogFiles,
      maximumLogBytesPerFile: this.maxLogBytes,
      restartRequiredAfterChangingCollection: true
    };
  }

  atomicWrite(target, content) {
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, target);
  }

  rotateIfNeeded(incomingBytes = 0) {
    let size = 0;
    try { size = fs.statSync(this.logPath).size; } catch (_error) {}
    if (size + incomingBytes <= this.maxLogBytes) return;
    for (let index = this.maxLogFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? this.logPath : `${this.logPath}.${index - 1}`;
      const target = `${this.logPath}.${index}`;
      if (!fs.existsSync(source)) continue;
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.renameSync(source, target);
    }
  }

  log(event, metadata = {}) {
    if (!this.preferences().enabled) return;
    const entry = `${new Date().toISOString()} ${redact(event)} ${safeJson(metadata)}\n`;
    this.rotateIfNeeded(Buffer.byteLength(entry));
    fs.appendFileSync(this.logPath, entry, { encoding: 'utf8', mode: 0o600 });
  }

  prune(now = Date.now()) {
    const cutoff = now - CRASH_RETENTION_MS;
    for (const root of [this.root, this.crashRoot]) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_error) {}
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const target = path.join(root, entry.name);
        try {
          if (fs.statSync(target).mtimeMs < cutoff) fs.unlinkSync(target);
        } catch (_error) {}
      }
    }
  }

  listLogFiles() {
    return [this.logPath, ...Array.from({ length: this.maxLogFiles - 1 }, (_, index) => `${this.logPath}.${index + 1}`)]
      .filter(filePath => fs.existsSync(filePath));
  }

  crashDumpCount() {
    try {
      return fs.readdirSync(this.crashRoot, { withFileTypes: true }).filter(entry => entry.isFile()).length;
    } catch (_error) {
      return 0;
    }
  }

  supportBundleFiles(appInfo = {}) {
    const manifest = {
      format: 'eclass-support-bundle',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: {
        version: redact(appInfo.version || ''),
        electron: redact(appInfo.electron || ''),
        platform: redact(appInfo.platform || ''),
        arch: redact(appInfo.arch || '')
      },
      policy: this.policy(),
      crashDumpCount: this.crashDumpCount(),
      notice: 'Raw crash dumps, profiles, learners, grades, PINs, tokens, and database contents are excluded.'
    };
    const files = [{ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) }];
    this.listLogFiles().forEach((filePath, index) => {
      files.push({ name: `logs/main-${index + 1}.log`, content: redact(fs.readFileSync(filePath, 'utf8')) });
    });
    return files;
  }

  deleteAll() {
    for (const filePath of this.listLogFiles()) {
      try { fs.unlinkSync(filePath); } catch (_error) {}
    }
    let crashes = [];
    try { crashes = fs.readdirSync(this.crashRoot); } catch (_error) {}
    for (const name of crashes) {
      const target = path.resolve(this.crashRoot, name);
      if (path.dirname(target) !== this.crashRoot) continue;
      try { if (fs.statSync(target).isFile()) fs.unlinkSync(target); } catch (_error) {}
    }
    return { success: true };
  }
}

module.exports = {
  CRASH_RETENTION_MS,
  DiagnosticService,
  MAX_LOG_BYTES,
  MAX_LOG_FILES,
  redact,
  safeJson
};
