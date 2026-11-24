// Fathom connection test. Tries the saved FATHOM_API_KEY against the Fathom API in several
// ways and reports what each one returned, so we can tell "wrong key" from "wrong request".
// The report never contains the key (only its length and its first/last two characters).
import { cleanToken } from './secrets.js';

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
