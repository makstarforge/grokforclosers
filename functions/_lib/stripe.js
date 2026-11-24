// Minimal read-only Stripe API client (server side only).
// STRIPE_API_BASE exists only so tests can point at a local mock.

import { cleanToken } from './secrets.js';

export function makeStripe(env, fetchFn = fetch) {
  const base = (env && env.STRIPE_API_BASE) || 'https://api.stripe.com';
  const key = cleanToken(env && env.STRIPE_SECRET_KEY);

  async function get(path, params = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k + '[]', String(x)));
      else url.searchParams.set(k, String(v));
    }
    const res = await fetchFn(url.toString(), { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw new Error('Stripe ' + res.status + ' on ' + path + ': ' + text.slice(0, 240));
    try { return JSON.parse(text); } catch (e) { throw new Error('Stripe returned non-JSON on ' + path); }
  }

  async function listAll(path, params, maxPages = 10) {
    const all = [];
    let after;
    for (let page = 0; page < maxPages; page++) {
      const r = await get(path, { ...params, limit: 100, ...(after ? { starting_after: after } : {}) });
      const data = r.data || [];
      all.push(...data);
      if (!r.has_more || !data.length) break;
      after = data[data.length - 1].id;
    }
    return all;
  }

  return {
    configured: Boolean(key),

    // Find the Payment Link whose public URL ends with the given code.
    async findPaymentLinkId(urlCode) {
      const links = await listAll('/v1/payment_links', {}, 5);
      const hit = links.find((l) => typeof l.url === 'string' && l.url.endsWith('/' + urlCode));
      return hit ? hit.id : null;
    },

    // Promotion code id -> human code (e.g. promo_123 -> SAMEDAY).
    async promotionCodeMap() {
      const promos = await listAll('/v1/promotion_codes', {}, 5);
      const map = new Map();
      for (const p of promos) map.set(p.id, p.code);
      return map;
    },

    async listSessions({ sinceEpoch, paymentLinkId, expandDiscounts }) {
      const params = { 'created[gte]': sinceEpoch };
      if (paymentLinkId) params.payment_link = paymentLinkId;
      if (expandDiscounts) params.expand = ['data.total_details.breakdown'];
      return listAll('/v1/checkout/sessions', params, 10);
    },
  };
}
