// GET /dashboard -> the dashboard page (behind the /dashboard login middleware).
import { PAGE_HTML } from '../_lib/page.js';

export function onRequestGet() {
  return new Response(PAGE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
