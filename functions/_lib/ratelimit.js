// Best-effort rate limiting with the Workers Cache API (per data centre). Returns false when over the limit.
export async function allow(key, limit, windowSeconds) {
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  if (!cache) return true;
  const url = 'https://ratelimit.internal/' + encodeURIComponent(key);
  try {
    const hit = await cache.match(url);
    const count = hit ? Number(hit.headers.get('x-count') || 0) : 0;
    if (count >= limit) return false;
    await cache.put(url, new Response('1', { headers: { 'x-count': String(count + 1), 'Cache-Control': 'max-age=' + windowSeconds } }));
  } catch (e) { /* never block a signup because the limiter failed */ }
  return true;
}
