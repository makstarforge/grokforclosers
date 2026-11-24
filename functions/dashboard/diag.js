// GET /dashboard/diag         -> plain-text Fathom connection test
// GET /dashboard/diag?events  -> what Fathom's events list looks like and how it answers event queries
// GET /dashboard/diag?kit     -> read-only check of the Kit key (used for UTM tagging on /onepercent)
// Both are behind the /dashboard login middleware and never include the API key.
import { runFathomDiag, runEventDiag, runKitDiag } from '../_lib/diag.js';

export async function onRequestGet({ request, env }) {
  let report;
  try {
    const q = new URL(request.url).searchParams;
    report = q.has('kit') ? await runKitDiag(env) : q.has('events') ? await runEventDiag(env) : await runFathomDiag(env);
  } catch (e) {
    report = { verdict: 'The test itself failed to run.', tests: [] };
  }
  return new Response(JSON.stringify(report, null, 2), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
