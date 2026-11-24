// Kit (ConvertKit) v4 API helpers: apply a "<utm_source>-<utm_campaign>" tag to a new subscriber.
// Needs the KIT_API_KEY secret (Kit > Developer settings > API keys). Without it, nothing happens.
// KIT_API_BASE exists only so tests can point at a local mock.
import { cleanToken } from './secrets.js';

const NEW_SUBSCRIBER_WINDOW_MS = 30 * 60 * 1000; // only tag people who signed up in the last 30 minutes
const WAIT_SCHEDULE_MS = [0, 2000, 3000, 5000, 8000, 10000]; // Kit creates the subscriber just after the form post

// "Webinar Launch!" -> "webinar-launch". Letters, numbers, - and _ only; max 40 characters.
export function sanitizePart(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 40);
}

// utm_source + utm_campaign -> "webinar-steckler" (null unless both are present).
export function tagNameFor(source, campaign) {
  const s = sanitizePart(source);
  const c = sanitizePart(campaign);
  return s && c ? s + '-' + c : null;
}

export function makeKit(env, fetchFn = fetch) {
  const base = (env && env.KIT_API_BASE) || 'https://api.kit.com';
  const key = cleanToken(env && env.KIT_API_KEY);

  async function call(method, path, { query, body } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetchFn(url.toString(), {
      method,
      headers: { 'X-Kit-Api-Key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    return { ok: res.ok, status: res.status, json };
  }

  return {
    configured: Boolean(key),

    // Newest-first match for an email; status=all so unconfirmed (double opt-in) subscribers are found too.
    async findSubscriber(email) {
      const r = await call('GET', '/v4/subscribers', { query: { email_address: email, status: 'all' } });
      if (!r.ok) throw new Error('Kit ' + r.status + ' looking up the subscriber');
      const list = (r.json && r.json.subscribers) || [];
      return list.find((s) => String(s.email_address).toLowerCase() === email.toLowerCase()) || null;
    },

    // Look a tag up by name (case-insensitive) across all pages.
    async findTag(name) {
      let after;
      for (let page = 0; page < 20; page++) {
        const r = await call('GET', '/v4/tags', { query: { per_page: 1000, ...(after ? { after } : {}) } });
        if (!r.ok) throw new Error('Kit ' + r.status + ' listing tags');
        const hit = ((r.json && r.json.tags) || []).find((t) => String(t.name).toLowerCase() === name.toLowerCase());
        if (hit) return hit;
        const pg = r.json && r.json.pagination;
        if (!pg || !pg.has_next_page || !pg.end_cursor) return null;
        after = pg.end_cursor;
      }
      return null;
    },

    async createTag(name) {
      const r = await call('POST', '/v4/tags', { body: { name } });
      return r.ok && r.json && r.json.tag ? r.json.tag : null;
    },

    async tagSubscriber(tagId, email) {
      const r = await call('POST', '/v4/tags/' + encodeURIComponent(tagId) + '/subscribers', { body: { email_address: email } });
      if (!r.ok) throw new Error('Kit ' + r.status + ' applying the tag');
    },
  };
}

// Returns a short outcome object (never contains the email or the key).
//   { tagged: true, tag, created } on success, or { skipped: '<reason>' }
export async function applyUtmTag({ email, utm_source, utm_campaign }, env, deps = {}) {
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || (() => Date.now());
  const kit = makeKit(env, deps.fetchFn || fetch);

  const name = tagNameFor(utm_source, utm_campaign);
  if (!name) return { skipped: 'needs both utm_source and utm_campaign' };
  if (!kit.configured) return { skipped: 'KIT_API_KEY is not set' };

  // Kit creates the subscriber a moment after the browser posts the form, so wait for them to appear.
  let subscriber = null;
  for (const delay of WAIT_SCHEDULE_MS) {
    if (delay) await sleep(delay);
    subscriber = await kit.findSubscriber(email);
    if (subscriber) break;
  }
  if (!subscriber) return { skipped: 'subscriber not found in Kit' };

  // Safety: only tag people who just signed up, so this public endpoint can't be used to tag anyone else.
  const createdAt = Date.parse(subscriber.created_at);
  if (!Number.isFinite(createdAt) || now() - createdAt > NEW_SUBSCRIBER_WINDOW_MS) return { skipped: 'not a new subscriber' };

  // Look up first; only create if missing; re-look-up if a concurrent signup created it first.
  let tag = await kit.findTag(name);
  let created = false;
  if (!tag) {
    tag = await kit.createTag(name);
    created = Boolean(tag);
    if (!tag) tag = await kit.findTag(name);
  }
  if (!tag) return { skipped: 'could not find or create the tag' };

  await kit.tagSubscriber(tag.id, email);
  return { tagged: true, tag: name, created };
}
