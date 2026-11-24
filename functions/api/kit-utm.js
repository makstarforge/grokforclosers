// POST /api/kit-utm  (public; called by the /onepercent signup form with navigator.sendBeacon)
// Body: { email, utm_source, utm_medium, utm_campaign, utm_content, utm_term }
// When utm_source and utm_campaign are both present, tags the new Kit subscriber "<source>-<campaign>".
// It answers 204 immediately and does the Kit work in the background, so it can never slow down or
// break the signup. It does nothing unless the KIT_API_KEY secret is set.
import { applyUtmTag } from '../_lib/kit.js';
import { originAllowed } from '../_lib/origin.js';

const MAX_BODY_BYTES = 4096;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env, waitUntil }) {
  if (!originAllowed(request)) return new Response('Forbidden', { status: 403 });

  let data;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new Response('Too large', { status: 413 });
    data = JSON.parse(text);
  } catch (e) {
    return new Response('Bad request', { status: 400 });
  }
  const email = String((data && data.email) || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return new Response('Bad request', { status: 400 });

  const work = applyUtmTag({ email, utm_source: data.utm_source, utm_campaign: data.utm_campaign }, env)
    .then((r) => { if (r && r.skipped) console.log('kit-utm skipped: ' + r.skipped); })
    .catch((e) => console.log('kit-utm failed: ' + String(e && e.message ? e.message : e).slice(0, 120)));
  if (typeof waitUntil === 'function') waitUntil(work);

  return noContent();
}

export function onRequest() {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
