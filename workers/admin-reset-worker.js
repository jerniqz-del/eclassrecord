/**
 * E-Class Record — Admin Password Reset Cloudflare Worker
 *
 * Endpoints:
 *   POST /request      — Generate OTP, email it, store hashed version in KV
 *   POST /verify       — Validate OTP, return signed JWT on success
 *   POST /verify-jwt   — Validate a JWT (keeps JWT_SECRET server-side)
 *
 * Environment variables (set via wrangler secret put or dashboard):
 *   RESEND_API_KEY    — Resend email API key
 *   ADMIN_EMAIL       — Destination email for OTP
 *   JWT_SECRET        — 32+ char secret for signing JWTs
 *   APP_SECRET        — Shared secret with the Electron app (abuse prevention)
 *
 * KV namespace binding: OTP_STORE
 *
 * Deploy: wrangler deploy
 */

const OTP_TTL_SECONDS  = 900;   // 15 minutes
const OTP_LENGTH       = 8;
const MAX_OTP_ATTEMPTS = 3;
const JWT_TTL_SECONDS  = 300;   // 5 minutes

// ── Helpers ───────────────────────────────────────────────────

function generateOtp() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous O,0,1,I
  let otp = '';
  const arr = new Uint8Array(OTP_LENGTH);
  crypto.getRandomValues(arr);
  for (const byte of arr) otp += chars[byte % chars.length];
  return otp;
}

async function hashOtp(otp, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(otp));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function signJwt(payload, secret) {
  const enc = new TextEncoder();
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const body    = btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const data    = `${header}.${body}`;
  const key     = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigB64  = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${data}.${sigB64}`;
}

async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const data = `${header}.${body}`;
    const enc  = new TextEncoder();
    const key  = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBuf = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid  = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
  });
}

// ── Rate Limiter (basic IP-based, using KV TTL trick) ─────────

async function checkRateLimit(env, ip) {
  const key = `rl:${ip}`;
  const raw = await env.OTP_STORE.get(key);
  const count = raw ? parseInt(raw) : 0;
  if (count >= 3) return false;
  await env.OTP_STORE.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}

// ── Main handler ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    // Verify shared app secret on all endpoints
    if (!body.appSecret || body.appSecret !== env.APP_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ── POST /request ─────────────────────────────────────────
    if (url.pathname === '/request') {
      const allowed = await checkRateLimit(env, ip);
      if (!allowed) return json({ error: 'Too many reset requests. Try again in 1 hour.' }, 429);

      const otp  = generateOtp();
      const hash = await hashOtp(otp, env.JWT_SECRET);
      const formatted = `${otp.slice(0,4)}-${otp.slice(4)}`;

      // Store hashed OTP + attempt counter in KV
      await env.OTP_STORE.put('otp_hash', JSON.stringify({ hash, attempts: 0 }), {
        expirationTtl: OTP_TTL_SECONDS
      });

      // Send email via Resend
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'E-Class Record Admin <no-reply@resend.dev>',
          to: env.ADMIN_EMAIL,
          subject: 'Admin Passphrase Reset Code',
          html: `
            <div style="font-family:sans-serif; max-width:480px; margin:0 auto; padding:32px;">
              <h2 style="color:#1e293b; margin-bottom:8px;">🔐 Admin Passphrase Reset</h2>
              <p style="color:#475569;">A passphrase reset was requested for the E-Class Record Admin panel.</p>
              <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:12px; padding:24px; text-align:center; margin:24px 0;">
                <div style="font-size:32px; font-weight:800; letter-spacing:8px; color:#4f46e5; font-family:monospace;">${formatted}</div>
                <div style="color:#94a3b8; font-size:13px; margin-top:8px;">Expires in 15 minutes</div>
              </div>
              <p style="color:#64748b; font-size:13px;">If you did not request this, ignore this email. Your passphrase was <strong>not</strong> changed.</p>
            </div>
          `
        })
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error('Resend error:', errText);
        return json({ error: 'Failed to send reset email.' }, 500);
      }

      return json({ success: true });
    }

    // ── POST /verify ──────────────────────────────────────────
    if (url.pathname === '/verify') {
      const { otp } = body;
      if (!otp || typeof otp !== 'string') return json({ error: 'OTP required.' }, 400);

      const stored = await env.OTP_STORE.get('otp_hash');
      if (!stored) return json({ error: 'No active reset request. Please request a new code.' }, 400);

      const { hash: storedHash, attempts } = JSON.parse(stored);

      if (attempts >= MAX_OTP_ATTEMPTS) {
        await env.OTP_STORE.delete('otp_hash');
        return json({ error: 'Too many failed attempts. Please request a new code.' }, 429);
      }

      const candidateHash = await hashOtp(otp.replace('-','').toUpperCase(), env.JWT_SECRET);

      if (candidateHash !== storedHash) {
        // Increment attempt counter
        await env.OTP_STORE.put('otp_hash', JSON.stringify({ hash: storedHash, attempts: attempts + 1 }), {
          expirationTtl: OTP_TTL_SECONDS
        });
        const remaining = MAX_OTP_ATTEMPTS - attempts - 1;
        return json({ error: `Incorrect code. ${remaining} attempt(s) remaining.` }, 400);
      }

      // Valid — delete OTP (single use) and issue JWT
      await env.OTP_STORE.delete('otp_hash');

      const jwt = await signJwt({
        sub: 'admin-reset',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
        jti: crypto.randomUUID()  // unique token ID
      }, env.JWT_SECRET);

      return json({ success: true, jwt });
    }

    // ── POST /verify-jwt ──────────────────────────────────────
    if (url.pathname === '/verify-jwt') {
      const { jwt } = body;
      if (!jwt) return json({ error: 'JWT required.' }, 400);

      const payload = await verifyJwt(jwt, env.JWT_SECRET);
      if (!payload || payload.sub !== 'admin-reset') {
        return json({ valid: false }, 200);
      }

      return json({ valid: true });
    }

    return json({ error: 'Not found' }, 404);
  }
};
