// /dashboard/kit-tagging  (behind the /dashboard login): admin tool for the campaign-tagging feature
//   GET  -> the page
//   POST -> JSON actions:
//     { action: 'tag', subscriber_id }  run the tagging for one subscriber now and show every step
//     { action: 'status' }              is the webhook secret set, and which Kit webhooks exist
//     { action: 'register' }            register the Kit webhook for form 10176758 pointing at /api/kit-webhook
//     { action: 'delete', webhook_id }  delete one of OUR webhooks
// These are deliberate admin actions (they can write to Kit); the page asks for confirmation first.
import { KIT_TAGGING_PAGE } from '../_lib/kittagpage.js';
import { processSubscriber, makeKit, FORM_ID_DEFAULT } from '../_lib/kittag.js';

export const WEBHOOK_EVENT = 'subscriber.form_subscribe';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const isOurs = (url) => /\/api\/kit-webhook(\?|$)/.test(String(url || ''));
const hideToken = (s) => String(s || '').replace(/([?&]token=)[^&#"\s]*/gi, '$1[hidden]');

function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return false;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}
function scrub(value, secret) {
  let text = JSON.stringify(value);
  if (secret) text = text.split(secret).join('[hidden]').split(encodeURIComponent(secret)).join('[hidden]');
  return JSON.parse(hideToken(text));
}

export function onRequestGet() {
  return new Response(KIT_TAGGING_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request) || !/application\/json/i.test(request.headers.get('Content-Type') || '')) return json({ error: 'Forbidden.' }, 403);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }
  const secret = env && env.KIT_WEBHOOK_SECRET ? String(env.KIT_WEBHOOK_SECRET) : '';
  const formId = String((env && env.KIT_FORM_ID) || FORM_ID_DEFAULT);
  const host = new URL(request.url).hostname;
  const kit = makeKit(env);
  if (!kit.configured && body.action !== 'status') return json({ error: 'KIT_API_KEY is not set.' }, 400);

  async function listWebhooks() {
    const r = await kit.request('GET', '/v4/webhooks?per_page=100');
    const list = r.ok && r.json && Array.isArray(r.json.webhooks) ? r.json.webhooks : [];
    return { status: r.status, ok: r.ok, list, raw: r.json };
  }

  try {
    switch (body.action) {
      case 'tag': {
        // One immediate look (no waiting), bypassing the duplicate guard: this is a deliberate manual run.
        const result = await processSubscriber(body.subscriber_id, env, { schedule: [0], force: true });
        return json(scrub(result, secret));
      }
      case 'status': {
        const w = kit.configured ? await listWebhooks() : { status: 0, ok: false, list: [] };
        return json(scrub({
          apiKeySet: kit.configured, secretSet: secret.length >= 16, secretTooShort: secret.length > 0 && secret.length < 16,
          formId, event: WEBHOOK_EVENT, endpoint: 'https://' + host + '/api/kit-webhook?token=[hidden]', hostIsProduction: host === 'grokforclosers.com' || host === 'www.grokforclosers.com',
          kitWebhooksStatus: w.status,
          webhooks: w.list.map((x) => ({ id: x.id, event: x.event, target_url: x.target_url, ours: isOurs(x.target_url) })),
        }, secret));
      }
      case 'register': {
        if (secret.length < 16) return json({ error: 'Set the KIT_WEBHOOK_SECRET secret first (at least 16 random characters), redeploy, then register.' }, 400);
        if (!(host === 'grokforclosers.com' || host === 'www.grokforclosers.com')) return json({ error: 'Register the webhook from grokforclosers.com (not a preview address), so it points at the live site.' }, 400);
        const target = 'https://' + host + '/api/kit-webhook?token=' + encodeURIComponent(secret);
        const existing = await listWebhooks();
        const dup = existing.list.find((x) => x.target_url === target && x.event && x.event.name === WEBHOOK_EVENT);
        if (dup) return json(scrub({ already: true, id: dup.id }, secret));
        const r = await kit.request('POST', '/v4/webhooks', { target_url: target, event: { name: WEBHOOK_EVENT, form_id: Number(formId) } });
        return json(scrub({ status: r.status, ok: r.ok, response: r.json }, secret));
      }
      case 'delete': {
        const id = String(body.webhook_id || '');
        if (!/^\d{1,15}$/.test(id)) return json({ error: 'Invalid webhook id.' }, 400);
        const w = await listWebhooks();
        const hook = w.list.find((x) => String(x.id) === id);
        if (!hook || !isOurs(hook.target_url)) return json({ error: 'That is not one of our webhooks; refusing to delete it.' }, 400);
        const r = await kit.request('DELETE', '/v4/webhooks/' + id);
        return json({ status: r.status, ok: r.ok });
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: 'The request failed.' }, 500);
  }
}
