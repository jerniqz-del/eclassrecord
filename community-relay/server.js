const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'questions.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MAX_QUESTION_LENGTH = 700;
const MAX_RECENT_QUESTIONS = 500;
const MAX_SIDEBAR_ADS = 8;
const MAX_BODY_LENGTH = 32768;
const ADS_CONFIG_KEY = 'sidebar_ads';
const ADS_ADMIN_TOKEN = process.env.ADS_ADMIN_TOKEN || '';

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, '{}');
}

function readQuestions() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeQuestions(questions) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(questions.slice(-MAX_RECENT_QUESTIONS), null, 2));
}

function readConfig() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function writeConfig(config) {
  ensureStore();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config || {}, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_LENGTH) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function normalizeQuestionPayload(body) {
  const question = String(body.question || '').trim().slice(0, MAX_QUESTION_LENGTH);
  if (!question) return null;

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    question,
    appVersion: String(body.appVersion || '').slice(0, 40),
    matchedFaqId: String(body.matchedFaqId || '').slice(0, 120),
    installId: String(body.installId || '').slice(0, 120),
    timestamp: body.timestamp && !Number.isNaN(Date.parse(body.timestamp))
      ? new Date(body.timestamp).toISOString()
      : new Date().toISOString(),
    dismissedBy: []
  };
}

function publicQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    appVersion: question.appVersion,
    matchedFaqId: question.matchedFaqId,
    installId: question.installId,
    timestamp: question.timestamp
  };
}

function limitText(value, length) {
  return String(value || '').trim().slice(0, length);
}

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172) {
    const secondOctet = Number(private172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

function normalizeHttpUrl(value, fieldName, required = false) {
  const raw = limitText(value, 500);
  if (!raw) {
    if (required) throw new Error(`${fieldName} is required.`);
    return '';
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_err) {
    throw new Error(`${fieldName} must be a valid URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use http or https.`);
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`${fieldName} cannot point to a private or local address.`);
  }

  return parsed.toString();
}

function normalizeSidebarAdsPayload(body) {
  const ads = Array.isArray(body.ads) ? body.ads : [];
  if (!ads.length) throw new Error('At least one sidebar ad is required.');
  if (ads.length > MAX_SIDEBAR_ADS) throw new Error(`A maximum of ${MAX_SIDEBAR_ADS} sidebar ads is allowed.`);

  return ads.map((ad, index) => {
    const title = limitText(ad.title, 120);
    if (!title) throw new Error(`Ad ${index + 1} needs a title.`);

    return {
      placementId: limitText(ad.placementId, 80) || `sidebar-sponsor-${index + 1}`,
      title,
      body: limitText(ad.body, 220),
      imageUrl: normalizeHttpUrl(ad.imageUrl, `Ad ${index + 1} imageUrl`),
      clickUrl: normalizeHttpUrl(ad.clickUrl, `Ad ${index + 1} clickUrl`, true),
      label: limitText(ad.label, 40) || 'Sponsored',
      provider: limitText(ad.provider, 40) || 'owner',
      previewTitle: limitText(ad.previewTitle, 140),
      previewDescription: limitText(ad.previewDescription, 260),
      previewImageUrl: normalizeHttpUrl(ad.previewImageUrl, `Ad ${index + 1} previewImageUrl`)
    };
  });
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'eclassrecord-community-relay' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/ads/sidebar') {
    const config = readConfig();
    const adConfig = config[ADS_CONFIG_KEY] || {};
    sendJson(res, 200, {
      success: true,
      version: adConfig.version || '',
      updatedAt: adConfig.updatedAt || '',
      ads: Array.isArray(adConfig.ads) ? adConfig.ads : []
    });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/admin/sidebar-ads') {
    if (!ADS_ADMIN_TOKEN) {
      sendJson(res, 503, { error: 'ADS_ADMIN_TOKEN is not configured.' });
      return;
    }

    if (getBearerToken(req) !== ADS_ADMIN_TOKEN) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return;
    }

    try {
      const ads = normalizeSidebarAdsPayload(await readBody(req));
      const timestamp = new Date().toISOString();
      const config = readConfig();
      config[ADS_CONFIG_KEY] = {
        version: timestamp,
        updatedAt: timestamp,
        ads
      };
      writeConfig(config);
      sendJson(res, 200, { success: true, ...config[ADS_CONFIG_KEY] });
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'Invalid sidebar ad config.' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/community/questions') {
    try {
      const payload = normalizeQuestionPayload(await readBody(req));
      if (!payload) {
        sendJson(res, 400, { error: 'Question is required.' });
        return;
      }

      const questions = readQuestions();
      questions.push(payload);
      writeQuestions(questions);
      sendJson(res, 201, { success: true, question: publicQuestion(payload) });
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'Invalid request.' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/community/questions/recent') {
    const since = url.searchParams.get('since');
    const sinceTime = since && !Number.isNaN(Date.parse(since)) ? Date.parse(since) : 0;
    const questions = readQuestions()
      .filter(question => Date.parse(question.timestamp) > sinceTime)
      .slice(-50)
      .map(publicQuestion);
    sendJson(res, 200, { questions });
    return;
  }

  const dismissMatch = url.pathname.match(/^\/community\/questions\/([^/]+)\/dismiss$/);
  if (req.method === 'POST' && dismissMatch) {
    const questionId = decodeURIComponent(dismissMatch[1]);
    const body = await readBody(req).catch(() => ({}));
    const installId = String(body.installId || '').slice(0, 120);
    const questions = readQuestions();
    const question = questions.find(item => item.id === questionId);

    if (question && installId && !question.dismissedBy.includes(installId)) {
      question.dismissedBy.push(installId);
      writeQuestions(questions);
    }

    sendJson(res, 200, { success: true });
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}

ensureStore();
http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    sendJson(res, 500, { error: err.message || 'Server error.' });
  });
}).listen(PORT, () => {
  console.log(`Community relay listening on http://localhost:${PORT}`);
});
