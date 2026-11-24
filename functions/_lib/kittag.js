// Campaign tagging for Kit subscribers, driven by Kit's NATIVE attribution.
//
// For a subscriber id it:
//   1. reads GET /v4/subscribers/{id}?include=attribution  (verified: subscriber.attribution.utm_source / utm_campaign)
//   2. builds the tag name "<utm_source>-<utm_campaign>" (lower-case, validated)
//   3. finds that tag in Kit, creating it only if it does not exist (with caps on tag creation)
//   4. applies the tag to the subscriber
//
// Note: Kit's attribution is how the subscriber was ORIGINALLY acquired, not necessarily the form they
// subscribed through most recently. The tag therefore reflects original acquisition.
//
// Every Kit operation here is idempotent (finding, and applying a tag that is already applied), so duplicate
// deliveries or retries are harmless. A tagging failure never affects signup or the course: this code only
// ever runs after the subscription, in the background.
import { cleanToken } from './secrets.js';
import { makeSoftCache } from './softcache.js';

export const FORM_ID_DEFAULT = '10176758'; // 1PC Course Signup - Landing Page
export const LIMITS = {
  maxPartLength: 40,           // each of source / campaign, after cleaning
  maxTags: 500,                // never create a tag when the account already has this many
  createPerHour: 10,           // best-effort cap on NEW tags per hour (per data centre)
  attributionSchedule: [0, 3000, 7000, 12000], // ms before each look at the subscriber (bounded retries, ~22 s)
  maxRetryAfterMs: 8000,
};

// ------------------------------------------------------------------ tag names
// "Webinar Launch!" -> "webinar-launch": lower-case letters, numbers, "-" and "_" only.
export function sanitizePart(value) {
  const raw = (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : '';
  if (!raw || raw.length > 100) return null;
  const s = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return s && s.length <= LIMITS.maxPartLength ? s : null;
}

// -> { ok: true, name } or { ok: false, kind: 'missing' | 'invalid', reason }
export function buildTagName(source, campaign) {
  const present = (v) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '';
  if (!present(source) || !present(campaign)) return { ok: false, kind: 'missing', reason: 'utm_source or utm_campaign is missing' };
  const s = sanitizePart(source); const c = sanitizePart(campaign);
  if (!s || !c) return { ok: false, kind: 'invalid', reason: 'utm_source or utm_campaign is unusable (empty after cleaning, or too long)' };
  return { ok: true, name: s + '-' + c };
}

// ------------------------------------------------------------------ Kit API (with bounded retries)
export function makeKit(env, deps = {}) {
  const fetchFn = deps.fetchFn || fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = (env && env.KIT_API_BASE) || 'https://api.kit.com';
  const key = cleanToken(env && env.KIT_API_KEY);
  let scheme = 0; // 0: X-Kit-Api-Key, 1: Authorization: Bearer (switched automatically if Kit answers 401)
  const authHeaders = () => (scheme === 0 ? { 'X-Kit-Api-Key': key } : { Authorization: 'Bearer ' + key });

  // One request with up to 4 attempts: 429 honours Retry-After (capped); 5xx and network errors back off.
  async function request(method, path, body) {
    let last = { status: 0, ok: false, json: null };
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetchFn(base + path, {
          method, headers: { ...authHeaders(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        last = { status: res.status, ok: res.ok, json };
        if (res.status === 401 && scheme === 0) { scheme = 1; continue; }
        if ((res.status === 429 || res.status >= 500) && attempt < 3) {
          const ra = Number(res.headers.get('retry-after'));
          await sleep(res.status === 429 && ra > 0 ? Math.min(ra * 1000, LIMITS.maxRetryAfterMs) : 400 * 2 ** attempt);
          continue;
        }
        return last;
      } catch (e) {
        last = { status: 0, ok: false, json: null, error: String(e && e.message ? e.message : e).slice(0, 100) };
        if (attempt < 3) { await sleep(400 * 2 ** attempt); continue; }
      }
    }
    return last;
  }

  return {
    configured: Boolean(key),
    request,
    getSubscriber: (id) => request('GET', '/v4/subscribers/' + id + '?include=attribution'),

    // All tags, following pagination.
    async listTags() {
      const tags = []; let after;
      for (let page = 0; page < 50; page++) {
        const r = await request('GET', '/v4/tags?per_page=1000' + (after ? '&after=' + encodeURIComponent(after) : ''));
        if (!r.ok) return { ok: false, status: r.status, tags };
        tags.push(...((r.json && r.json.tags) || []));
        const pg = r.json && r.json.pagination;
        if (!pg || !pg.has_next_page || !pg.end_cursor) return { ok: true, status: r.status, tags };
        after = pg.end_cursor;
      }
      return { ok: true, status: 200, tags };
    },
    async createTag(name) {
      const r = await request('POST', '/v4/tags', { name });
      return { ok: r.ok, status: r.status, tag: r.ok && r.json ? r.json.tag : null };
    },
    // By subscriber id; falls back to the by-email form of the endpoint if Kit does not have the by-id route.
    async applyTag(tagId, subscriber) {
      let r = await request('POST', '/v4/tags/' + encodeURIComponent(tagId) + '/subscribers/' + encodeURIComponent(subscriber.id), {});
      if (!r.ok && (r.status === 404 || r.status === 405) && subscriber.email_address) {
        r = await request('POST', '/v4/tags/' + encodeURIComponent(tagId) + '/subscribers', { email_address: subscriber.email_address });
      }
      return { ok: r.ok, status: r.status };
    },
  };
}

// ------------------------------------------------------------------ the job
// Returns { outcome: 'tagged' | 'skipped' | 'failed', reason?, tag?, created?, attempts, steps[] }.
// Never throws, and its report never contains the API key or the subscriber's email.
export async function processSubscriber(subscriberId, env, deps = {}) {
  const id = String(subscriberId == null ? '' : subscriberId).trim();
  const steps = [];
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const cache = deps.cache || makeSoftCache();
  const log = deps.log || ((o) => console.log(JSON.stringify({ evt: 'kit-tag', ...o })));
  const schedule = deps.schedule || LIMITS.attributionSchedule;
  const maxTags = Number(env && env.KIT_MAX_TAGS) > 0 ? Number(env.KIT_MAX_TAGS) : LIMITS.maxTags;
  const createPerHour = Number(env && env.KIT_MAX_NEW_TAGS_PER_HOUR) > 0 ? Number(env.KIT_MAX_NEW_TAGS_PER_HOUR) : LIMITS.createPerHour;
  let attempts = 0;
  const done = (outcome, extra = {}) => {
    const r = { outcome, subscriber_id: id, attempts, ...extra, steps };
    try { log({ outcome, subscriber_id: id, tag: r.tag, created: r.created, reason: r.reason, attempts }); } catch (e) { /* logging must never throw */ }
    return r;
  };

  try {
    if (!/^\d{1,15}$/.test(id)) return done('skipped', { reason: 'not a valid subscriber id' });
    const kit = makeKit(env, { fetchFn: deps.fetchFn, sleep });
    if (!kit.configured) return done('failed', { reason: 'KIT_API_KEY is not set' });

    // 1. read the native attribution; bounded retries because Kit may attach it a moment after the subscription
    let tagInfo = null; let subscriber = null; let lastReason = 'attribution not available'; let lastError = null;
    for (const delay of schedule) {
      if (delay) await sleep(delay);
      attempts++;
      const r = await kit.getSubscriber(id);
      steps.push({ step: 'fetch subscriber with include=attribution', attempt: attempts, status: r.status });
      if (r.status === 404) return done('skipped', { reason: 'subscriber not found in Kit' });
      if (r.status === 401 || r.status === 403) return done('failed', { reason: 'Kit rejected the API key (HTTP ' + r.status + ')' });
      if (!r.ok) { lastError = 'Kit API error (HTTP ' + (r.status || 'network') + ')'; continue; }
      lastError = null;
      subscriber = r.json && r.json.subscriber;
      if (!subscriber || String(subscriber.id) !== id) { lastError = 'unexpected response from Kit'; continue; }
      const attr = subscriber.attribution || {};
      const built = buildTagName(attr.utm_source, attr.utm_campaign);
      steps.push({ step: 'attribution', utm_source: attr.utm_source == null ? null : String(attr.utm_source).slice(0, 60), utm_campaign: attr.utm_campaign == null ? null : String(attr.utm_campaign).slice(0, 60), result: built.ok ? 'tag name ' + built.name : built.reason });
      if (built.ok) { tagInfo = built; break; }
      if (built.kind === 'invalid') return done('skipped', { reason: built.reason }); // retrying will not change it
      lastReason = built.reason;
    }
    if (!tagInfo) {
      return lastError ? done('failed', { reason: lastError + ' on every attempt' }) : done('skipped', { reason: lastReason + ' after ' + attempts + ' check(s)' });
    }
    const name = tagInfo.name;

    // 2. duplicate-delivery guard (best effort; applying the same tag twice is harmless anyway)
    if (!deps.force && !(await cache.claim('kittag:' + id + ':' + name, 90))) return done('skipped', { tag: name, reason: 'already being processed (duplicate delivery)' });

    // 3. find the tag, or create it within limits
    const listed = await kit.listTags();
    steps.push({ step: 'list tags', status: listed.status, count: listed.tags.length });
    if (!listed.ok) return done('failed', { tag: name, reason: 'could not list tags (HTTP ' + (listed.status || 'network') + ')' });
    const matches = (tags) => tags.filter((t) => String(t.name).toLowerCase() === name);
    let found = matches(listed.tags); let created = false;
    if (!found.length) {
      if (listed.tags.length >= maxTags) return done('skipped', { tag: name, reason: 'tag limit reached (' + maxTags + '); not creating a new tag' });
      if ((await cache.count('kittag-created-hour')) >= createPerHour) return done('skipped', { tag: name, reason: 'new-tag rate limit reached (' + createPerHour + ' per hour); not creating a new tag' });
      const c = await kit.createTag(name);
      steps.push({ step: 'create tag', status: c.status });
      if (c.ok) { created = true; await cache.bump('kittag-created-hour', 3600); }
      // re-read: covers a concurrent signup that created the same tag first, and detects duplicates
      const again = await kit.listTags();
      found = again.ok ? matches(again.tags) : (c.tag ? [c.tag] : []);
      if (!found.length) return done('failed', { tag: name, reason: 'could not create the tag (HTTP ' + (c.status || 'network') + ')' });
    }
    const tag = found.slice().sort((a, b) => Number(a.id) - Number(b.id))[0]; // lowest id = the original if duplicates ever exist
    if (found.length > 1) steps.push({ step: 'warning', note: found.length + ' tags named ' + name + ' exist; using id ' + tag.id });

    // 4. apply
    const applied = await kit.applyTag(tag.id, subscriber);
    steps.push({ step: 'apply tag', status: applied.status, tag_id: tag.id });
    if (!applied.ok) return done('failed', { tag: name, created, reason: 'could not apply the tag (HTTP ' + (applied.status || 'network') + ')' });
    return done('tagged', { tag: name, created, tag_id: tag.id });
  } catch (e) {
    return done('failed', { reason: 'unexpected error: ' + String(e && e.message ? e.message : e).slice(0, 120) });
  }
}
