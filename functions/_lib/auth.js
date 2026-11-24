// HTTP Basic auth for /dashboard. Runs on the server (Cloudflare Pages Function).
//
// Secrets come from the Pages project's Variables and Secrets, never from the repo:
//   DASHBOARD_PASSWORD  (required)  the password
//   DASHBOARD_USER      (optional)  the username, defaults to "admin"
//
// Fails CLOSED: if DASHBOARD_PASSWORD is not set, nobody gets in.

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// Constant-time comparison of two equal-length byte arrays.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function decodeBasic(header) {
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header || '');
  if (!m) return null;
  let bytes;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch (e) {
    return null;
  }
  const text = new TextDecoder().decode(bytes);
  const i = text.indexOf(':');
  if (i < 0) return null;
  return { user: text.slice(0, i), pass: text.slice(i + 1) };
}

// Returns { ok: true } or { ok: false, status, message }.
export async function checkAuth(request, env) {
  const password = env && env.DASHBOARD_PASSWORD;
  const username = (env && env.DASHBOARD_USER) || 'admin';
  if (!password) {
    return { ok: false, status: 503, message: 'Dashboard is not configured (DASHBOARD_PASSWORD is not set).' };
  }
  const creds = decodeBasic(request.headers.get('Authorization'));
  if (!creds) return { ok: false, status: 401, message: 'Authentication required.' };

  // Always compare both values (no early exit) so timing doesn't reveal which was wrong.
  const [uGiven, uWant, pGiven, pWant] = await Promise.all([
    sha256(creds.user), sha256(username), sha256(creds.pass), sha256(password),
  ]);
  const userOk = safeEqual(uGiven, uWant);
  const passOk = safeEqual(pGiven, pWant);
  if (userOk && passOk) return { ok: true };
  return { ok: false, status: 401, message: 'Authentication required.' };
}

export const SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export function denied(result) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' };
  if (result.status === 401) headers['WWW-Authenticate'] = 'Basic realm="Dashboard", charset="UTF-8"';
  return new Response(result.message, { status: result.status, headers });
}
