'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const { FuseState } = require('@electron/fuses/dist/constants');

async function main() {
  const executable = path.resolve(process.argv[2] || path.join('dist', 'phase2-final', 'win-unpacked', 'E-Class Record.exe'));
  if (!fs.existsSync(executable)) throw new Error(`Packaged executable not found: ${executable}`);
  const wire = await getCurrentFuseWire(executable);
  const expected = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE]
  ]);
  for (const [fuse, state] of expected) {
    assert.strictEqual(wire[fuse], state, `Unexpected fuse state for index ${fuse}`);
  }
  console.log(JSON.stringify({ executable, version: wire.version, verifiedFuses: expected.size }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
