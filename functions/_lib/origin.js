// Which sites may call our public /api endpoints.
export function originAllowed(request) {
  const raw = request.headers.get('Origin') || request.headers.get('Referer') || '';
  let host;
  try { host = new URL(raw).hostname; } catch (e) { return false; }
  if (host === 'grokforclosers.com' || host === 'www.grokforclosers.com' || host.endsWith('.grokforclosers.pages.dev')) return true;
  // Local development only: allowed when the request itself is addressed to localhost (never true in production).
  let self;
  try { self = new URL(request.url).hostname; } catch (e) { return false; }
  return (self === 'localhost' || self === '127.0.0.1') && host === self;
}

// Accept a landing-page URL only if it is one of our own pages (it is passed to Kit as the referrer).
export function ownPageUrl(value, request) {
  try {
    const u = new URL(String(value || ''));
    const h = u.hostname;
    let sameHost = false;
    try { sameHost = Boolean(request) && h === new URL(request.url).hostname; } catch (e) { /* ignore */ }
    const ours = sameHost || h === 'grokforclosers.com' || h === 'www.grokforclosers.com' || h.endsWith('.grokforclosers.pages.dev');
    return ours && (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString().slice(0, 500) : null;
  } catch (e) { return null; }
}
