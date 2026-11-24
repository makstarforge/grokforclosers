// READ-ONLY Kit API probe, used by the /dashboard/kit-attribution diagnostic page.
// Purpose: find out whether Kit's v4 API returns the native attribution (UTM) data that is visible in Kit's own
// interface. It only ever sends GET requests and never creates, changes or deletes anything in Kit.
// The API key is read from the KIT_API_KEY secret and is never included in the output.
// KIT_API_BASE exists only so tests can point at a local mock.
import { cleanToken } from './secrets.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const ATTR_RE = /attribution|utm|referrer/i;
const MAX_JSON_CHARS = 20000;
// Kit v4 API keys use X-Kit-Api-Key; OAuth access tokens use Authorization: Bearer. Try both, report which works.
const SCHEMES = [
  ['X-Kit-Api-Key header', (t) => ({ 'X-Kit-Api-Key': t })],
  ['Authorization: Bearer', (t) => ({ Authorization: 'Bearer ' + t })],
];

// Walk a JSON value and list every leaf that sits under a key mentioning attribution / utm / referrer.
export function findAttribution(json) {
  const out = [];
  (function walk(v, path, inside) {
    if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v);
      if (!entries.length) { if (inside) out.push({ path, value: Array.isArray(v) ? [] : {} }); return; }
      for (const [k, val] of entries) walk(val, path ? path + '.' + k : k, inside || ATTR_RE.test(k));
    } else if (inside) {
      out.push({ path, value: v });
    }
  })(json, '', false);
  return out;
}

// source / medium / campaign / term / content values found in those leaves
export function extractUtm(hits) {
  const utm = {};
  for (const h of hits) {
    const last = h.path.split('.').pop().toLowerCase();
    const m = /^(?:utm_)?(source|medium|campaign|term|content)$/.exec(last);
    if (m && typeof h.value === 'string' && h.value.trim()) utm[m[1]] = h.value.trim();
  }
  return utm;
}

const clip = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 200 ? s.slice(0, 200) + '…' : v; };

async function run(email, env, fetchFn) {
  const token = cleanToken(env && env.KIT_API_KEY);
  const base = (env && env.KIT_API_BASE) || 'https://api.kit.com';
  const result = {
    note: 'Read-only: GET requests only. Nothing is created or changed in Kit. The API key is never shown.',
    email, key: { present: Boolean(token), length: token.length }, auth: { attempts: [] }, keyChecks: [], calls: [],
    subscriberId: null, utm: {}, verdict: null,
  };
  if (!token) { result.verdict = { supportsAttribution: false, text: 'KIT_API_KEY is not set for this environment, so nothing could be tested.' }; return result; }

  async function get(headers, path) {
    try {
      const res = await fetchFn(base + path, { method: 'GET', headers: { ...headers, Accept: 'application/json' } });
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
      return { status: res.status, ok: res.ok, json, text };
    } catch (e) {
      return { status: 0, ok: false, json: null, text: 'Network error: ' + String(e && e.message ? e.message : e).slice(0, 120) };
    }
  }

  // 1. which way does Kit accept the key?
  let headers = null;
  for (const [label, make] of SCHEMES) {
    const r = await get(make(token), '/v4/account');
    result.auth.attempts.push({ scheme: label, status: r.status });
    if (r.ok) { headers = make(token); result.auth.scheme = label; break; }
  }
  if (!headers) {
    result.verdict = { supportsAttribution: false, text: 'Kit did not accept the key with either authentication method (see the statuses above), so attribution could not be tested. A 401 means the key is not valid for the v4 API.' };
    return result;
  }

  // 2. what the key can read (statuses only; these are the calls the tagging feature would need)
  for (const [label, path] of [['Account', '/v4/account'], ['List subscribers', '/v4/subscribers?per_page=1'], ['List tags', '/v4/tags?per_page=1'], ['List webhooks', '/v4/webhooks?per_page=1']]) {
    const r = await get(headers, path);
    result.keyChecks.push({ check: label, path, status: r.status, topLevelFields: r.json && typeof r.json === 'object' ? Object.keys(r.json) : undefined });
  }

  // 3. the probes the diagnostic is for
  async function probe(label, path, includeAttribution) {
    const r = await get(headers, path);
    const hits = r.json ? findAttribution(r.json) : [];
    const call = { label, method: 'GET', path, includeAttribution, status: r.status, ok: r.ok, attributionFields: hits.map((h) => ({ path: h.path, value: clip(h.value) })), utm: extractUtm(hits) };
    const body = r.json !== null ? JSON.stringify(r.json, null, 2) : r.text;
    call.response = body.length > MAX_JSON_CHARS ? body.slice(0, MAX_JSON_CHARS) + '\n… (truncated)' : body;
    call.json = r.json;
    result.calls.push(call);
    return call;
  }
  const enc = encodeURIComponent(email);
  const findId = (call) => {
    const list = call.json && Array.isArray(call.json.subscribers) ? call.json.subscribers : [];
    const hit = list.find((s) => s && String(s.email_address).toLowerCase() === email.toLowerCase());
    return hit && /^\d+$/.test(String(hit.id)) ? String(hit.id) : null;
  };
  const a = await probe('Lookup by email', '/v4/subscribers?email_address=' + enc, false);
  const b = await probe('Lookup by email + include=attribution', '/v4/subscribers?email_address=' + enc + '&include=attribution', true);
  let id = findId(a) || findId(b);
  if (!id) { // unconfirmed / inactive subscribers can be hidden from the default list
    const c = await probe('Lookup by email, status=all', '/v4/subscribers?email_address=' + enc + '&status=all', false);
    const d = await probe('Lookup by email, status=all + include=attribution', '/v4/subscribers?email_address=' + enc + '&status=all&include=attribution', true);
    id = findId(c) || findId(d);
  }
  if (!id) {
    result.verdict = { supportsAttribution: false, text: 'No subscriber with that email address was found (see the lookup responses). Check the address, including any +alias, and that it belongs to this Kit account.' };
    result.calls.forEach((c) => delete c.json);
    return result;
  }
  result.subscriberId = id;
  await probe('Individual subscriber', '/v4/subscribers/' + id, false);
  await probe('Individual subscriber + include=attribution', '/v4/subscribers/' + id + '?include=attribution', true);

  // 4. verdict
  const has = (c) => Boolean(c.utm.source && c.utm.campaign);
  const withInc = result.calls.filter((c) => c.includeAttribution && c.ok);
  const without = result.calls.filter((c) => !c.includeAttribution && c.ok);
  const foundAny = result.calls.find(has);
  if (foundAny) result.utm = foundAny.utm;
  const rejected = result.calls.filter((c) => c.includeAttribution && !c.ok);
  const anyFields = result.calls.some((c) => c.attributionFields.length);
  let text;
  if (foundAny) {
    const includeNeeded = withInc.some(has) && !without.some(has);
    text = 'YES: Kit\'s API returns the native attribution (utm source = "' + foundAny.utm.source + '", campaign = "' + foundAny.utm.campaign + '"). ' +
      (includeNeeded ? 'It only appears when include=attribution is requested.' : without.some(has) ? 'It is returned without include=attribution too.' : '');
  } else if (anyFields) {
    text = 'PARTLY: the responses contain attribution-related fields, but source and campaign are empty for this subscriber. Check that this subscriber really shows UTM Source and Campaign in Kit.';
  } else {
    text = 'NO: none of the responses contain any attribution, UTM or referrer fields' + (rejected.length ? ' (the include=attribution variants returned status ' + rejected.map((c) => c.status).join(', ') + ')' : '') + '. The attribution visible in Kit\'s interface was not returned by these endpoints.';
  }
  result.verdict = { supportsAttribution: Boolean(foundAny), includeAttributionNeeded: Boolean(foundAny) && withInc.some(has) && !without.some(has), text };
  result.calls.forEach((c) => delete c.json);
  return result;
}

export function validEmail(v) {
  const e = String(v || '').trim();
  return EMAIL_RE.test(e) && e.length <= 254 ? e : null;
}

// Final safety net: whatever Kit sends back, the key itself can never appear in the output.
export async function runKitAttributionProbe(email, env, fetchFn = fetch) {
  const result = await run(email, env, fetchFn);
  const secret = cleanToken(env && env.KIT_API_KEY);
  if (!secret) return result;
  const text = JSON.stringify(result);
  return text.includes(secret) ? JSON.parse(text.split(secret).join('[redacted]')) : result;
}
