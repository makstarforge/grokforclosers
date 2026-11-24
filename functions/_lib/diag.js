// Fathom connection test. Tries the saved FATHOM_API_KEY against the Fathom API in several
// ways and reports what each one returned, so we can tell "wrong key" from "wrong request".
// The report never contains the key (only its length and its first/last two characters).
import { cleanToken } from './secrets.js';
import { TZ, dayKey, rangeDays } from './dates.js';

const BASE_DEFAULT = 'https://api.usefathom.com';

async function probe(fetchFn, base, label, path, headers) {
  try {
    const res = await fetchFn(base + path, { headers, redirect: 'manual' });
    const text = await res.text();
    return {
      test: label,
      status: res.status,
      contentType: (res.headers.get('content-type') || '').split(';')[0] || undefined,
      redirectsTo: res.headers.get('location') || undefined,
      body: text.replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  } catch (e) {
    return { test: label, error: String(e && e.message ? e.message : e).slice(0, 140) };
  }
}

export async function runFathomDiag(env, fetchFn = fetch) {
  const raw = env && env.FATHOM_API_KEY;
  const token = cleanToken(raw);
  const base = (env && env.FATHOM_API_BASE) || BASE_DEFAULT;
  const key = {
    present: Boolean(token),
    length: token.length,
    containsPipe: token.includes('|'),
    firstTwo: token ? token.slice(0, 2) : null,
    lastTwo: token ? token.slice(-2) : null,
  };
  if (!token) {
    return { key, verdict: 'FATHOM_API_KEY is empty or not set for this environment (Production vs Preview?).', tests: [] };
  }

  const json = { Accept: 'application/json' };
  const afterPipe = token.includes('|') ? token.split('|').slice(1).join('|') : null;
  const jobs = [
    probe(fetchFn, base, 'Bearer + the key  (what the dashboard sends)', '/v1/sites?limit=1', { ...json, Authorization: 'Bearer ' + token }),
    afterPipe ? probe(fetchFn, base, 'Bearer + only the part after the "|"', '/v1/sites?limit=1', { ...json, Authorization: 'Bearer ' + afterPipe }) : null,
    probe(fetchFn, base, 'Bearer + the key, on /v1/account', '/v1/account', { ...json, Authorization: 'Bearer ' + token }),
    probe(fetchFn, base, 'The key without the word "Bearer"', '/v1/sites?limit=1', { ...json, Authorization: token }),
    probe(fetchFn, base, 'X-API-Key header', '/v1/sites?limit=1', { ...json, 'X-API-Key': token }),
    probe(fetchFn, base, 'CONTROL: a deliberately wrong key', '/v1/sites?limit=1', { ...json, Authorization: 'Bearer this-is-not-a-real-key' }),
  ].filter(Boolean);
  const tests = await Promise.all(jobs);

  const worked = tests.filter((t) => t.status >= 200 && t.status < 300 && !t.test.startsWith('CONTROL'));
  const control = tests.find((t) => t.test.startsWith('CONTROL'));
  let verdict;
  if (worked.length) {
    verdict = 'A variant WORKED: "' + worked[0].test + '". ' + (worked[0].test.startsWith('Bearer + the key  (what')
      ? 'So the key is fine and the dashboard request form is right; the problem is elsewhere (e.g. the site id or which events exist).'
      : 'The dashboard is using a different form, which is the bug; it needs to be changed to match.');
  } else if (control && tests.every((t) => t.status === control.status)) {
    verdict = 'Every variant (including the deliberately wrong key) got the same answer (' + control.status +
      '). Fathom does not recognise the saved value in any form, so the key itself is not valid for the API. ' +
      'Check the first/last two characters above against the token in Fathom, and make sure it is a freshly created API token.';
  } else {
    verdict = 'Mixed answers: compare the statuses below. A status other than 401 on a variant suggests Fathom recognised something about it.';
  }
  return { key, verdict, tests };
}

// Shows what Fathom's events list really looks like and how it answers each way of asking for an event's numbers.
export async function runEventDiag(env, fetchFn = fetch) {
  const token = cleanToken(env && env.FATHOM_API_KEY);
  const base = (env && env.FATHOM_API_BASE) || BASE_DEFAULT;
  const siteId = (env && env.FATHOM_SITE_ID) || 'JLCURLWB';
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
  const out = { siteId };
  try {
    const res = await fetchFn(base + '/v1/sites/' + encodeURIComponent(siteId) + '/events?limit=100', { headers });
    const text = await res.text();
    out.eventsListStatus = res.status;
    let j = null;
    try { j = JSON.parse(text); } catch (e) { out.eventsListBody = text.slice(0, 200); }
    const data = j && (Array.isArray(j) ? j : j.data) || [];
    out.eventCount = data.length;
    out.eventsSample = data.slice(0, 6).map((ev) => ({ fieldsPresent: Object.keys(ev), id: ev.id === undefined ? '(none)' : ev.id, name: ev.name }));
    const ev = data.find((e) => String(e.name).startsWith('CTA click:')) || data[0];
    if (!ev) { out.verdict = 'Fathom lists no events for this site.'; return out; }
    const today = dayKey(Date.now(), TZ);
    const days = rangeDays(today, 7);
    const common = { entity: 'event', aggregates: 'conversions,unique_conversions', date_grouping: 'day', timezone: TZ, date_from: days[0] + ' 00:00:00', date_to: today + ' 23:59:59' };
    const variants = [
      ev.id ? ['entity_id = the event id', { entity_id: ev.id }] : null,
      ['entity_name + entity_id = the site id', { entity_id: siteId, entity_name: ev.name }],
      ['entity_name + site_id', { entity_name: ev.name, site_id: siteId }],
      ['entity_name only', { entity_name: ev.name }],
    ].filter(Boolean);
    out.testedEvent = ev.name;
    out.attempts = [];
    for (const [label, extra] of variants) {
      const url = new URL(base + '/v1/aggregations');
      for (const [k, v] of Object.entries({ ...common, ...extra })) url.searchParams.set(k, String(v));
      try {
        const r = await fetchFn(url.toString(), { headers });
        const body = (await r.text()).replace(/\s+/g, ' ').trim();
        out.attempts.push({ how: label, status: r.status, body: body.slice(0, 200) });
      } catch (e) {
        out.attempts.push({ how: label, error: String(e.message).slice(0, 120) });
      }
    }
    const ok = out.attempts.find((a) => a.status >= 200 && a.status < 300);
    out.verdict = ok ? 'Fathom accepted: ' + ok.how : 'Fathom accepted none of these ways of asking for an event; see the bodies above.';
  } catch (e) {
    out.verdict = 'The events test failed to run: ' + String(e.message).slice(0, 120);
  }
  return out;
}
