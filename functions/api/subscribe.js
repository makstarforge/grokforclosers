// POST /api/subscribe  (public; called by the /onepercent signup form when the landing URL carries UTMs)
// Body: { email, first_name, referrer, elapsed, utm_source, utm_medium, utm_campaign, utm_content, utm_term }
// Adds the person to the Kit form through Kit's API (no reCAPTCHA step), passes the landing URL to Kit as the
// referrer, and applies the "<utm_source>-<utm_campaign>" tag. On any problem it answers { ok: false, step }
// and the page falls back to the original post to Kit, so a signup is never lost.
import { signUp } from '../_lib/kit.js';
import { originAllowed, ownPageUrl } from '../_lib/origin.js';
import { allow } from '../_lib/ratelimit.js';

const MAX_BODY_BYTES = 4096;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  if (!originAllowed(request)) return reply({ ok: false, step: 'forbidden' }, 403);

  let data;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return reply({ ok: false, step: 'too_large' }, 413);
    data = JSON.parse(text);
  } catch (e) {
    return reply({ ok: false, step: 'bad_request' }, 400);
  }
  const email = String((data && data.email) || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply({ ok: false, step: 'bad_email' }, 400);
  const firstName = String(data.first_name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);

  // Not a human-speed submit, or too many from one address: let the page use Kit's own form (and its spam checks).
  const elapsed = Number(data.elapsed);
  if (Number.isFinite(elapsed) && elapsed < 800) return reply({ ok: false, step: 'too_fast' }, 429);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await allow('ip:' + ip, 6, 600)) || !(await allow('email:' + email.toLowerCase(), 2, 600))) {
    return reply({ ok: false, step: 'rate_limited' }, 429);
  }

  const result = await signUp({
    email, first_name: firstName, referrer: ownPageUrl(data.referrer, request),
    utm_source: data.utm_source, utm_campaign: data.utm_campaign,
  }, env);
  if (!result.ok) {
    console.log('subscribe failed at ' + result.step + (result.status ? ' (' + result.status + ')' : ''));
    return reply({ ok: false, step: result.step, status: result.status }, result.step === 'not_configured' ? 503 : 502);
  }
  if (result.tagError) console.log('subscribe: signup ok, tag not applied: ' + result.tagError);
  return reply({ ok: true, tagged: Boolean(result.tagged) });
}

export function onRequest() {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
