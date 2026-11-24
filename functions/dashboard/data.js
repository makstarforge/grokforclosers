// GET /dashboard/data?days=30  ->  JSON report (behind the /dashboard login middleware).
import { buildDashboard } from '../_lib/report.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get('days') || '30', 10);
  if (![7, 14, 30, 90].includes(days)) days = 30;
  try {
    const report = await buildDashboard(env, days);
    return new Response(JSON.stringify(report), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not build the report.' }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
