// Best-effort short-lived memory (per Cloudflare data centre) built on the Workers Cache API.
// Used only to avoid duplicate work and to cap tag creation. Nothing here is required for correctness:
// every Kit operation we perform is idempotent, so if the cache is unavailable we simply do not dedupe.
export function makeSoftCache(store) {
  const getStore = () => store || (typeof caches !== 'undefined' && caches.default ? caches.default : null);
  const url = (k) => 'https://softcache.internal/' + encodeURIComponent(k);
  return {
    // true if this key was NOT seen recently (and is now claimed); false if it is already claimed.
    async claim(key, ttlSeconds) {
      const s = getStore(); if (!s) return true;
      try {
        if (await s.match(url(key))) return false;
        await s.put(url(key), new Response('1', { headers: { 'Cache-Control': 'max-age=' + ttlSeconds } }));
      } catch (e) { /* never block on cache errors */ }
      return true;
    },
    async count(key) {
      const s = getStore(); if (!s) return 0;
      try { const hit = await s.match(url(key)); return hit ? Number(hit.headers.get('x-count') || 0) : 0; } catch (e) { return 0; }
    },
    async bump(key, ttlSeconds) {
      const s = getStore(); if (!s) return;
      try {
        const hit = await s.match(url(key)); const n = hit ? Number(hit.headers.get('x-count') || 0) : 0;
        await s.put(url(key), new Response('1', { headers: { 'x-count': String(n + 1), 'Cache-Control': 'max-age=' + ttlSeconds } }));
      } catch (e) { /* ignore */ }
    },
  };
}
