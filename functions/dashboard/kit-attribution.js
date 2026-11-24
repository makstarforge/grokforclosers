// /dashboard/kit-attribution  (behind the /dashboard login)
//   GET  -> the read-only diagnostic page
//   POST -> { email } -> runs the read-only Kit probe and returns the results as JSON
// Makes GET requests to Kit only. It never creates tags, registers webhooks or changes subscribers.
import { KIT_ATTRIBUTION_PAGE } from '../_lib/kitpage.js';
import { runKitAttributionProbe, validEmail } from '../_lib/kitprobe.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export function onRequestGet() {
  return new Response(KIT_ATTRIBUTION_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  let email = null;
  try { email = validEmail((await request.json()).email); } catch (e) { /* fall through */ }
  if (!email) return json({ error: 'Enter a valid email address.' }, 400);
  try {
    return json(await runKitAttributionProbe(email, env));
  } catch (e) {
    return json({ error: 'The probe failed to run.' }, 500);
  }
}
