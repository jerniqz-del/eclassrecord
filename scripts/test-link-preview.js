const { isPrivateHost } = require('../src/main/link-preview-helper');

(async function main() {
  const hosts = ['example.com', 'github.com', 'localhost', '127.0.0.1', '169.254.169.254'];
  const results = [];
  for (const h of hosts) {
    const blocked = await isPrivateHost(h);
    results.push({ host: h, blocked });
  }
  console.log(JSON.stringify(results, null, 2));
})();