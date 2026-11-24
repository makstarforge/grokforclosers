// The repo root is the Pages output directory, so the files under /functions could otherwise
// also be downloaded as plain static files. They contain no secrets (keys live only in Cloudflare
// settings), but there is no reason to publish the source, so answer 404 for anything under /functions.
export async function onRequest() {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
