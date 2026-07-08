const MAX_QUESTION_LENGTH = 700;
const MAX_RECENT_QUESTIONS = 50;
const MAX_SIDEBAR_ADS = 8;
const ADS_CONFIG_KEY = 'sidebar_ads';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function limitText(value, length) {
  return String(value || '').trim().slice(0, length);
}

function randomId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_err) {
    return {};
  }
}

async function ensureSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      appVersion TEXT,
      matchedFaqId TEXT,
      installId TEXT,
      timestamp TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS dismissals (
      questionId TEXT NOT NULL,
      installId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      PRIMARY KEY (questionId, installId)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run();
}

function normalizeQuestionPayload(body) {
  const question = limitText(body.question, MAX_QUESTION_LENGTH);
  if (!question) return null;

  return {
    id: randomId(),
    question,
    appVersion: limitText(body.appVersion, 40),
    matchedFaqId: limitText(body.matchedFaqId, 120),
    installId: limitText(body.installId, 120),
    timestamp: body.timestamp && !Number.isNaN(Date.parse(body.timestamp))
      ? new Date(body.timestamp).toISOString()
      : new Date().toISOString()
  };
}

function publicQuestion(row) {
  return {
    id: row.id,
    question: row.question,
    appVersion: row.appVersion || '',
    matchedFaqId: row.matchedFaqId || '',
    installId: row.installId || '',
    timestamp: row.timestamp
  };
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

function getBearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function getSidebarAds(env) {
  const row = await env.DB.prepare('SELECT value, updatedAt FROM app_config WHERE key = ?')
    .bind(ADS_CONFIG_KEY)
    .first();

  if (!row) {
    return { success: true, version: '', updatedAt: '', ads: [] };
  }

  try {
    const parsed = JSON.parse(row.value || '{}');
    return {
      success: true,
      version: parsed.version || row.updatedAt || '',
      updatedAt: parsed.updatedAt || row.updatedAt || '',
      ads: Array.isArray(parsed.ads) ? parsed.ads : []
    };
  } catch (_err) {
    return { success: true, version: '', updatedAt: row.updatedAt || '', ads: [] };
  }
}

async function putSidebarAds(request, env) {
  if (!env.ADS_ADMIN_TOKEN) {
    return json({ error: 'ADS_ADMIN_TOKEN is not configured.' }, 503);
  }

  if (getBearerToken(request) !== env.ADS_ADMIN_TOKEN) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const ads = normalizeSidebarAdsPayload(await readJson(request));
  const timestamp = new Date().toISOString();
  const value = JSON.stringify({ version: timestamp, updatedAt: timestamp, ads });

  await env.DB.prepare(`
    INSERT INTO app_config (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).bind(ADS_CONFIG_KEY, value, timestamp).run();

  return json({ success: true, version: timestamp, updatedAt: timestamp, ads });
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return json({}, 204);
  if (!env.DB) return json({ error: 'D1 binding DB is required.' }, 500);

  await ensureSchema(env);
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'eclassrecord-community-relay' });
  }

  if (request.method === 'GET' && url.pathname === '/ads/sidebar') {
    return json(await getSidebarAds(env));
  }

  if (request.method === 'PUT' && url.pathname === '/admin/sidebar-ads') {
    try {
      return await putSidebarAds(request, env);
    } catch (err) {
      return json({ error: err.message || 'Invalid sidebar ad config.' }, 400);
    }
  }

  if (request.method === 'POST' && url.pathname === '/community/questions') {
    const payload = normalizeQuestionPayload(await readJson(request));
    if (!payload) return json({ error: 'Question is required.' }, 400);

    await env.DB.prepare(`
      INSERT INTO questions (id, question, appVersion, matchedFaqId, installId, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      payload.id,
      payload.question,
      payload.appVersion,
      payload.matchedFaqId,
      payload.installId,
      payload.timestamp
    ).run();

    return json({ success: true, question: publicQuestion(payload) }, 201);
  }

  if (request.method === 'GET' && url.pathname === '/community/questions/recent') {
    const since = url.searchParams.get('since');
    const sinceTime = since && !Number.isNaN(Date.parse(since))
      ? new Date(since).toISOString()
      : '1970-01-01T00:00:00.000Z';

    const result = await env.DB.prepare(`
      SELECT id, question, appVersion, matchedFaqId, installId, timestamp
      FROM questions
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(sinceTime, MAX_RECENT_QUESTIONS).all();

    const questions = (result.results || []).reverse().map(publicQuestion);
    return json({ questions });
  }

  const dismissMatch = url.pathname.match(/^\/community\/questions\/([^/]+)\/dismiss$/);
  if (request.method === 'POST' && dismissMatch) {
    const questionId = decodeURIComponent(dismissMatch[1]);
    const body = await readJson(request);
    const installId = limitText(body.installId, 120);
    const timestamp = body.timestamp && !Number.isNaN(Date.parse(body.timestamp))
      ? new Date(body.timestamp).toISOString()
      : new Date().toISOString();

    if (questionId && installId) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO dismissals (questionId, installId, timestamp)
        VALUES (?, ?, ?)
      `).bind(questionId, installId, timestamp).run();
    }

    return json({ success: true });
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return json({ error: err.message || 'Server error.' }, 500);
    }
  }
};
