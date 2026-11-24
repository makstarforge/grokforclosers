// Protects /dashboard and everything under it (the page and its data endpoint).
import { checkAuth, denied, SECURITY_HEADERS } from '../_lib/auth.js';

export async function onRequest(context) {
  const result = await checkAuth(context.request, context.env);
  if (!result.ok) return denied(result);

  const response = await context.next();
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
