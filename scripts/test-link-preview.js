const assert = require('assert/strict');
const { fetchPublicUrl, isPrivateHost, isPublicIp } = require('../src/main/link-preview-helper');

(async function main() {
  const privateAddresses = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '224.0.0.1', '::', '::1', 'fc00::1',
    'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1'
  ];
  for (const address of privateAddresses) {
    assert.equal(isPublicIp(address), false, `${address} must not be public`);
    assert.equal(await isPrivateHost(address), true, `${address} must be blocked`);
  }

  const publicAddresses = ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'];
  for (const address of publicAddresses) {
    assert.equal(isPublicIp(address), true, `${address} must be public`);
    assert.equal(await isPrivateHost(address), false, `${address} must be allowed`);
  }

  const publicLookup = async () => [{ address: '1.1.1.1', family: 4 }];
  const mixedLookup = async () => [
    { address: '1.1.1.1', family: 4 },
    { address: '127.0.0.1', family: 4 }
  ];
  const failingLookup = async () => { throw new Error('DNS failure'); };
  assert.equal(await isPrivateHost('public.test', publicLookup), false);
  assert.equal(await isPrivateHost('mixed.test', mixedLookup), true);
  assert.equal(await isPrivateHost('failure.test', failingLookup), true);
  assert.equal(await isPrivateHost('anything.localhost', publicLookup), true);

  const redirectFetch = async () => ({
    status: 302,
    headers: { get: (name) => name === 'location' ? 'http://127.0.0.1/private' : null }
  });
  await assert.rejects(
    fetchPublicUrl('https://public.test/start', { fetchImpl: redirectFetch, lookup: publicLookup }),
    /PRIVATE_HOST/
  );

  const finalResponse = { status: 200, headers: { get: () => null } };
  const allowed = await fetchPublicUrl('https://public.test/page', {
    fetchImpl: async () => finalResponse,
    lookup: publicLookup
  });
  assert.equal(allowed.response, finalResponse);
  assert.equal(allowed.finalUrl.toString(), 'https://public.test/page');

  console.log('Link-preview SSRF host checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
