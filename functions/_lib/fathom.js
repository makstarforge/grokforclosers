// Minimal Fathom Analytics API client (server side only).
// Auth: "Authorization: Bearer <FATHOM_API_KEY>". Base URL: https://api.usefathom.com
// FATHOM_API_BASE exists only so tests can point at a local mock.

export function makeFathom(env, fetchFn = fetch) {
  const base = (env && env.FATHOM_API_BASE) || 'https://api.usefathom.com';
  const token = env && env.FATHOM_API_KEY;

  async function get(path, params = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, k === 'filters' ? JSON.stringify(v) : String(v));
    }
    const res = await fetchFn(url.toString(), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) throw new Error('Fathom ' + res.status + ' on ' + path + ': ' + text.slice(0, 240));
    try { return JSON.parse(text); } catch (e) { throw new Error('Fathom returned non-JSON on ' + path); }
  }

  return {
    configured: Boolean(token),

    // All events defined for the site (paginated).
    async listEvents(siteId) {
      const all = [];
      let after;
      for (let page = 0; page < 10; page++) {
        const params = { limit: 100 };
        if (after) params.starting_after = after;
        const r = await get('/v1/sites/' + encodeURIComponent(siteId) + '/events', params);
        const data = Array.isArray(r) ? r : (r.data || []);
        all.push(...data);
        if (Array.isArray(r) || !r.has_more || !data.length) break;
        after = data[data.length - 1].id;
      }
      return all;
    },

    // GET /v1/aggregations. Retries once without `limit` if Fathom rejects that parameter.
    async aggregate(params) {
      try {
        const r = await get('/v1/aggregations', params);
        if (!Array.isArray(r)) throw new Error('Fathom aggregation did not return a list');
        return r;
      } catch (e) {
        if (params.limit && /limit/i.test(String(e.message))) {
          const { limit, ...rest } = params;
          const r = await get('/v1/aggregations', rest);
          if (!Array.isArray(r)) throw new Error('Fathom aggregation did not return a list');
          return r;
        }
        throw e;
      }
    },
  };
}
