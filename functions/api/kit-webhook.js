// POST /api/kit-webhook?token=<KIT_WEBHOOK_SECRET>
// Receives Kit's "subscriber subscribed to form" webhook and tags the subscriber "<utm_source>-<utm_campaign>"
// from their native Kit attribution. Independent of the signup: it only ever runs AFTER the subscription, answers
// immediately, and does its work in the background, so it can never slow down or break signup or the course.
//
// Security: fails closed unless KIT_WEBHOOK_SECRET (16+ characters) is set; the token is compared in constant time.
// The payload is not trusted for anything but the subscriber id: attribution, email and the rest are read from
// Kit's API, so a forged or replayed request can at most re-run an idempotent tagging of a real subscriber.
import { processSubscriber, FORM_ID_DEFAULT } from '../_lib/kittag.js';

const MAX_BODY = 65536;
const enc = new TextEncoder();
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function sameSecret(given, wanted) {
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(given))), crypto.subtle.digest('SHA-256', enc.encode(String(wanted)))]);
  const x = new Uint8Array(a); const y = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const asId = (v) => (typeof v === 'number' || typeof v === 'string') && /^\d{1,15}$/.test(String(v)) ? String(v) : null;

// Kit's exact payload shape is not relied on: look in the places a subscriber id is normally found.
export function extractSubscriberId(p) {
  if (!p || typeof p !== 'object') return null;
  return asId(p.subscriber && p.subscriber.id) || asId(p.subscriber_id) || asId(p.id) || asId(p.data && p.data.subscriber && p.data.subscriber.id) || null;
}
export function extractFormId(p) {
  if (!p || typeof p !== 'object') return null;
  return asId(p.form && p.form.id) || asId(p.form_id) || asId(p.subscriber && p.subscriber.form_id) || asId(p.event && p.event.form_id) || null;
}

export async function onRequestPost({ request, env, waitUntil }) {
  const secret = env && env.KIT_WEBHOOK_SECRET;
  if (!secret || String(secret).length < 16) return reply({ error: 'not configured' }, 503);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!(await sameSecret(token, secret))) return reply({ error: 'unauthorized' }, 401);

  let payload;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply({ error: 'too large' }, 413);
    payload = JSON.parse(text);
  } catch (e) {
    return reply({ error: 'bad request' }, 400);
  }

  const id = extractSubscriberId(payload);
  if (!id) {
    console.log(JSON.stringify({ evt: 'kit-webhook', ignored: 'no subscriber id', payload_keys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 12) : typeof payload }));
    return reply({ received: true, ignored: 'no subscriber id' });
  }
  const formId = extractFormId(payload);
  const wantedForm = String((env && env.KIT_FORM_ID) || FORM_ID_DEFAULT);
  if (formId && formId !== wantedForm) {
    console.log(JSON.stringify({ evt: 'kit-webhook', ignored: 'other form', form_id: formId }));
    return reply({ received: true, ignored: 'other form' });
  }

  // Answer right away; do the (bounded-retry) work after the response.
  const work = processSubscriber(id, env);
  if (typeof waitUntil === 'function') waitUntil(work);
  return reply({ received: true });
}

export function onRequest() {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
