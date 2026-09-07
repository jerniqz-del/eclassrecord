const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainDir = path.join(root, 'src', 'main');
const outputDir = path.join(root, 'docs');

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function mainFiles() {
  return fs.readdirSync(mainDir)
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(mainDir, name))
    .sort();
}

function matches(files, regex, mapper) {
  const rows = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source))) {
      rows.push(mapper(match, {
        file: relative(file),
        line: lineNumber(source, match.index),
      }));
    }
  }
  return rows;
}

function sideEffect(channel) {
  const prefix = channel.split(':')[0];
  return {
    admin: 'Changes privileged admin session state.',
    db: 'Reads or atomically writes the profile database.',
    database: 'Creates a durable database restore point.',
    dialog: 'Opens a native dialog and may read or write a user-selected file.',
    attachment: 'Reads, imports, opens, or removes an assessment attachment.',
    backup: 'Scans or reads backup material.',
    'shared-sync': 'Reads or changes shared-folder configuration or data.',
    companion: 'Starts, stops, publishes, or configures companion synchronization.',
    bluetooth: 'Controls Web Bluetooth device selection.',
    updater: 'Checks, downloads, or installs a desktop update.',
    shell: 'Launches an operating-system URL or resource.',
    'link-preview': 'Performs a remote metadata request.',
    'school-cloud': 'Reads or changes School Cloud state or encrypted remote data.',
    app: 'Reads metadata or controls application shutdown.',
    system: 'Reads local performance information.',
  }[prefix] || 'Handler-specific application side effect.';
}

function authExpectation(channel) {
  if (channel === 'admin:authenticate') return 'Passphrase is checked; sender is not centrally validated.';
  if (channel.startsWith('admin:')) return 'Admin session is checked where implemented; sender is not centrally validated.';
  if (channel.startsWith('school-cloud:')) return 'School connection/authentication is handler-specific; sender is not centrally validated.';
  return 'No central trusted-sender gate; profile/admin authorization is handler-specific.';
}

function buildInventory() {
  const files = mainFiles();
  const ipc = matches(files, /ipcMain\.(handle|on)\(\s*['"]([^'"]+)['"]\s*,\s*([^\n]+)/g,
    (m, at) => ({ receiver: m[1], channel: m[2], signature: m[3].trim().slice(0, 180), ...at }));
  const bridges = matches([path.join(mainDir, 'preload.js')],
    /^\s*([A-Za-z0-9_]+):\s*([^\n]*?)ipcRenderer\.(invoke|send|on)\(\s*['"]([^'"]+)['"]/gm,
    (m, at) => ({ api: m[1], arguments: m[2].trim(), operation: m[3], channel: m[4], ...at }));
  const sends = matches(files, /(?:webContents|\.sender)\.send\(\s*['"]([^'"]+)['"]/g,
    (m, at) => ({ channel: m[1], ...at }));
  const windows = matches(files, /new BrowserWindow\s*\(/g, (_m, at) => at);
  const dialogs = matches(files, /dialog\.(showOpenDialog|showSaveDialog|showMessageBox|showErrorBox)\s*\(/g,
    (m, at) => ({ method: m[1], ...at }));
  const shell = matches(files, /shell\.(openExternal|openPath|showItemInFolder)\s*\(/g,
    (m, at) => ({ method: m[1], ...at }));
  const sessions = matches(files, /session\.(?:defaultSession|fromPartition\([^)]*\))(?:\.[A-Za-z0-9_]+)*/g,
    (m, at) => ({ expression: m[0], ...at }));
  const protocols = matches(files, /(?:\bprotocol\.(?:handle|unhandle|registerFileProtocol|registerBufferProtocol)|registerSchemesAsPrivileged|setAsDefaultProtocolClient)/g,
    (m, at) => ({ expression: m[0], ...at }));
  const timers = matches(files, /\b(setInterval|setTimeout)\s*\(/g,
    (m, at) => ({ method: m[1], ...at }));
  const lifecycle = matches(files, /(?:app|powerMonitor)\.on\(\s*['"]([^'"]+)['"]/g,
    (m, at) => ({ event: m[1], ...at }));
  const fileSystem = matches(files, /\b(fs|fileIO)\.([A-Za-z0-9_]+)\s*\(/g,
    (m, at) => ({ owner: m[1], method: m[2], ...at }));
  const services = matches(files, /\b(companionSyncService|sharedFolderSync|mobileUpdateChannel|updater|schoolCloudService)\.([A-Za-z0-9_]+)\s*\(/g,
    (m, at) => ({ service: m[1], method: m[2], ...at }));

  const bridgeByChannel = new Map(bridges.map(item => [item.channel, item]));
  const allChannels = [...new Set([
    ...ipc.map(item => item.channel),
    ...bridges.map(item => item.channel),
    ...sends.map(item => item.channel),
  ])].sort();
  const channels = allChannels.map(channel => {
    const receiver = ipc.find(item => item.channel === channel);
    const bridge = bridgeByChannel.get(channel);
    const sent = sends.find(item => item.channel === channel);
    return {
      channel,
      direction: receiver
        ? (receiver.receiver === 'handle' ? 'Renderer invoke -> Main' : 'Renderer send -> Main')
        : 'Main -> Renderer',
      bridge: bridge ? bridge.api : '',
      input: receiver ? receiver.signature : 'Main event payload; renderer callback is channel-specific.',
      auth: authExpectation(channel),
      limits: 'No centralized IPC size limit; handler validation must be reviewed in Phase 2.',
      sideEffect: sideEffect(channel),
      timeout: channel.startsWith('companion:')
        ? 'Companion request flow has handler-specific timeouts.'
        : 'No centralized timeout; promise/event behavior is handler-specific.',
      errors: receiver?.receiver === 'handle'
        ? 'Thrown/rejected errors propagate through ipcRenderer.invoke.'
        : 'Event channel; failures require handler-specific acknowledgement.',
      location: receiver ? `${receiver.file}:${receiver.line}` : (sent ? `${sent.file}:${sent.line}` : `${bridge.file}:${bridge.line}`),
    };
  });

  const sourceDigest = crypto.createHash('sha256');
  for (const file of files) sourceDigest.update(relative(file)).update('\0').update(fs.readFileSync(file));
  return { sourceSha256: sourceDigest.digest('hex'), files: files.map(relative), windows, ipc, bridges, sends, channels, dialogs, shell, sessions, protocols, timers, lifecycle, fileSystem, services };
}

function table(rows, columns) {
  const header = `| ${columns.map(column => column.label).join(' | ')} |`;
  const rule = `|${columns.map(() => '---').join('|')}|`;
  const body = rows.map(row => `| ${columns.map(column => String(row[column.key] ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')} |`);
  return [header, rule, ...body].join('\n');
}

function locationRows(rows, detail) {
  return rows.map(row => ({ detail: detail(row), location: `${row.file}:${row.line}` }));
}

function capabilityMarkdown(data) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  return `# Phase 0 Electron Capability Inventory

Generated by \`scripts/generate-electron-phase0-inventory.js\`.

- Source digest: \`${data.sourceSha256}\`
- Main-process JavaScript files: ${data.files.length}
- BrowserWindow constructors: ${data.windows.length}
- Main IPC receivers: ${data.ipc.length}
- Preload IPC bridge methods: ${data.bridges.length}
- Unique IPC/event channels: ${data.channels.length}
- Native dialogs: ${data.dialogs.length}
- Shell launches: ${data.shell.length}
- Session expressions: ${data.sessions.length}
- Protocol registrations: ${data.protocols.length}
- Timers: ${data.timers.length}
- Electron package range: \`${pkg.devDependencies?.electron || ''}\`
- Installed Electron: \`${require(path.join(root, 'node_modules', 'electron', 'package.json')).version}\`

## Windows and renderer boundary

${table(locationRows(data.windows, () => 'BrowserWindow constructor'), [{ key: 'detail', label: 'Surface' }, { key: 'location', label: 'Location' }])}

The main application window loads a local renderer with a preload, \`nodeIntegration: false\`, \`contextIsolation: true\`, and currently \`sandbox: false\`. The recovery print window is sandboxed. The preload exposes named methods rather than raw ipcRenderer, but it currently loads QR and Sudoku Node packages and must be refactored before full sandboxing.

## Native dialogs

${table(locationRows(data.dialogs, row => row.method), [{ key: 'detail', label: 'Method' }, { key: 'location', label: 'Location' }])}

## Shell and operating-system launches

${table(locationRows(data.shell, row => row.method), [{ key: 'detail', label: 'Method' }, { key: 'location', label: 'Location' }])}

## Sessions and protocols

${table(locationRows(data.sessions, row => row.expression), [{ key: 'detail', label: 'Session expression' }, { key: 'location', label: 'Location' }])}

Protocol registrations found: ${data.protocols.length}. A secure internal application protocol and external deep-link protocol are not currently registered.

## Lifecycle and timers

${table(locationRows(data.lifecycle, row => row.event), [{ key: 'detail', label: 'Lifecycle event' }, { key: 'location', label: 'Location' }])}

${table(locationRows(data.timers, row => row.method), [{ key: 'detail', label: 'Timer' }, { key: 'location', label: 'Location' }])}

## Filesystem operations

${table(locationRows(data.fileSystem, row => `${row.owner}.${row.method}`), [{ key: 'detail', label: 'Operation' }, { key: 'location', label: 'Location' }])}

The database root is resolved by \`src/main/file-io.js\`. Attachments are constrained through the attachment-root and resolved-path helpers in \`src/main/main.js\`. Backups, restore points, shared-folder envelopes, mobile update manifests/APKs, admin state, School Cloud vault state, and companion identity are additional persistent surfaces.

## Service integrations

${table(locationRows(data.services, row => `${row.service}.${row.method}`), [{ key: 'detail', label: 'Operation' }, { key: 'location', label: 'Location' }])}

## Packaging and update channels

- Desktop updates: electron-updater with a GitHub provider.
- Mobile updates: independent GitHub manifest/APK cache plus packaged Android resources.
- Installer: NSIS, per-user by default, changeable installation directory.
- Application files: \`src/**/*\`; source maps excluded.
- Android packaged resources: versioned APK and \`mobile-update.json\`.

Relevant builder configuration:

\`\`\`yaml
${builder.trim()}
\`\`\`

## Current security and reliability observations

- Present: context isolation, disabled renderer Node integration, limited preload bridge, safeStorage for School Cloud secrets, atomic database writing, backup integrity, automatic updates, and a single-instance lock.
- Missing or incomplete: main renderer sandbox, centralized IPC sender validation, centralized payload limits, permission handlers, navigation/new-window denial, restricted external URL policy, CSP, secure internal protocol, Electron fuses, crash recovery, and power lifecycle handling.
- These observations are inventory results only. Remediation belongs to later phases.
`;
}

function ipcMarkdown(data) {
  return `# Phase 0 IPC Inventory

Generated by \`scripts/generate-electron-phase0-inventory.js\`.

This is a complete channel-level inventory of IPC receivers, preload bridge calls, and main-to-renderer events discovered in \`src/main\`. Input shows the current handler signature. The authentication, limit, timeout, and error columns deliberately describe the current centralized posture; handler-specific validation remains visible in source and will be normalized in Phase 2.

${table(data.channels, [
  { key: 'channel', label: 'Channel' },
  { key: 'direction', label: 'Direction' },
  { key: 'bridge', label: 'Bridge API' },
  { key: 'input', label: 'Current input/signature' },
  { key: 'auth', label: 'Current authorization' },
  { key: 'limits', label: 'Current limits' },
  { key: 'sideEffect', label: 'Side effect' },
  { key: 'timeout', label: 'Timeout' },
  { key: 'errors', label: 'Errors' },
  { key: 'location', label: 'Location' },
])}
`;
}

function outputs(data) {
  return new Map([
    [path.join(outputDir, 'electron-phase0-capability-inventory.md'), capabilityMarkdown(data)],
    [path.join(outputDir, 'electron-phase0-ipc-inventory.md'), ipcMarkdown(data)],
    [path.join(outputDir, 'electron-phase0-inventory.json'), JSON.stringify(data, null, 2) + '\n'],
  ]);
}

function main() {
  const data = buildInventory();
  const generated = outputs(data);
  if (process.argv.includes('--write')) {
    for (const [file, content] of generated) fs.writeFileSync(file, content);
    console.log(`Wrote ${generated.size} Phase 0 inventory artifacts for ${data.channels.length} channels.`);
    return;
  }
  if (process.argv.includes('--check')) {
    for (const [file, content] of generated) {
      if (!fs.existsSync(file)) throw new Error(`Missing generated inventory: ${relative(file)}`);
      const current = fs.readFileSync(file, 'utf8');
      if (current !== content) throw new Error(`Stale generated inventory: ${relative(file)}`);
    }
    console.log(`Phase 0 inventory is current: ${data.channels.length} channels across ${data.files.length} main-process files.`);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
