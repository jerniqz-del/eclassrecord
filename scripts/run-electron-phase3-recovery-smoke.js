'use strict';

const { spawn } = require('child_process');
const electron = require('electron');

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
let output = '';
const child = spawn(electron, ['.', '--phase3-recovery-smoke'], {
  cwd: require('path').join(__dirname, '..'),
  env: environment,
  windowsHide: true
});

const timer = setTimeout(() => {
  child.kill();
  console.error('Phase 3 recovery smoke timed out.');
  process.exit(1);
}, 100_000);

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}

child.on('exit', code => {
  clearTimeout(timer);
  if (code !== 0 || !output.includes('PHASE3_RECOVERY_OK') || output.includes('PHASE3_RECOVERY_FAIL')) {
    process.exit(1);
  }
});
