const dns = require('dns').promises;

async function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172) {
    const secondOctet = Number(private172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  try {
    // Resolve DNS to check IPs; be conservative and block on resolution errors
    const addrs = await dns.lookup(host, { all: true });
    for (const a of addrs) {
      const ip = a.address;
      if (/^127\./.test(ip) || ip === '0.0.0.0' || ip === '::1') return true;
      if (/^10\./.test(ip) || /^169\.254\./.test(ip) || /^192\.168\./.test(ip)) return true;
      const m = ip.match(/^172\.(\d+)\./);
      if (m) {
        const so = Number(m[1]);
        if (so >= 16 && so <= 31) return true;
      }
      // IPv6 link-local and ULA
      if (/^fe80:/.test(ip) || /^(fc|fd)/.test(ip)) return true;
    }
    return false;
  } catch (err) {
    return true; // on DNS errors, treat as private to be safe
  }
}

module.exports = { isPrivateHost };