// GET /dashboard/diag -> plain-text Fathom connection test (behind the /dashboard login middleware).
import { runFathomDiag } from '../_lib/diag.js';

export async function onRequestGet({ env }) {
  let report;
  try {
    report = await runFathomDiag(env);
  } catch (e) {
    report = { verdict: 'The test itself failed to run.', tests: [] };
  }
  return new Response(JSON.stringify(report, null, 2), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
