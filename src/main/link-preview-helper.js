const dns = require('dns').promises;
const net = require('net');

function isPublicIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first >= 224) return false;
  return true;
}

function isPublicIp(address) {
  const ip = String(address || '').toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const version = net.isIP(ip);
  if (version === 4) return isPublicIpv4(ip);
  if (version !== 6) return false;

  const mappedIpv4 = ip.match(/^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4[1]);

  if (ip === '::' || ip === '::1') return false;
  const firstGroup = parseInt(ip.split(':')[0] || '0', 16);
  if ((firstGroup & 0xfe00) === 0xfc00) return false; // Unique local fc00::/7
  if ((firstGroup & 0xffc0) === 0xfe80) return false; // Link local fe80::/10
  if ((firstGroup & 0xff00) === 0xff00) return false; // Multicast ff00::/8
  return true;
}

async function isPrivateHost(hostname, lookup = dns.lookup) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIP(host)) return !isPublicIp(host);

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address));
  } catch (_error) {
    // Fail closed when DNS cannot provide a verified public destination.
    return true;
  }
}

async function fetchPublicUrl(initialUrl, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const lookup = options.lookup || dns.lookup;
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = initialUrl instanceof URL ? initialUrl : new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (await isPrivateHost(currentUrl.hostname, lookup)) throw new Error('PRIVATE_HOST');
    const response = await fetchImpl(currentUrl.toString(), {
      redirect: 'manual',
      signal: options.signal,
      headers: options.headers
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl };
    }
    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) throw new Error('INVALID_REDIRECT');
    currentUrl = new URL(location, currentUrl);
    if (!['http:', 'https:'].includes(currentUrl.protocol)) throw new Error('UNSUPPORTED_REDIRECT');
  }
  throw new Error('INVALID_REDIRECT');
}

module.exports = { fetchPublicUrl, isPrivateHost, isPublicIp };
