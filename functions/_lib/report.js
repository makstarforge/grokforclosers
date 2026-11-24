// Builds the dashboard report from Fathom (visits, clicks, signups) and Stripe (purchases).
// If one source fails, the rest still render and the failure is listed in `errors`.
import { TZ, dayKey, startOfDayEpochSec, rangeDays } from './dates.js';
import { makeFathom } from './fathom.js';
import { makeStripe } from './stripe.js';

export const SITE_ID_DEFAULT = 'JLCURLWB';           // public Fathom site id
export const PAYMENT_LINK_CODE = '7sYbJ354pazNanZaPQ4Ja00'; // buy.stripe.com/<code>
export const FUNNEL_PAGES = ['/', '/partner', '/sameday'];
export const ONEPERCENT_PATH = '/onepercent';
// Purchases are attributed to a page by the coupon code that page pre-fills.
export const PAGE_BY_COUPON = { PARTNER500: '/partner', SAMEDAY: '/sameday' };
const CTA_PREFIX = 'CTA click:';
const SIGNUP_PREFIX = 'Signup submit:';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function normPath(p) {
  let s = String(p || '/').split('?')[0];
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}
const rowDay = (r) => String(r.date || '').slice(0, 10);
const campaignName = (v) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s && s.toLowerCase() !== 'null' ? s : '(no campaign)';
};
function addTo(map, key, n) { map.set(key, (map.get(key) || 0) + n); }
const toSeries = (days, map) => days.map((date) => ({ date, value: map.get(date) || 0 }));

// ---------------------------------------------------------------- Fathom
async function loadFathom({ fathom, siteId, base, errors, notes }) {
  const out = { visits: null, clicks: null, onepercent: null };
  if (!fathom.configured) {
    errors.push({ source: 'fathom', message: 'FATHOM_API_KEY is not set.' });
    return out;
  }
  const pv = { ...base, entity: 'pageview', entity_id: siteId, aggregates: 'visits,uniques,pageviews' };

  // Visits per day per page.
  let pageRows = [];
  try {
    pageRows = await fathom.aggregate({ ...pv, date_grouping: 'day', field_grouping: 'pathname', limit: 1000 });
    out.visits = pageRows.map((r) => ({ path: normPath(r.pathname), day: rowDay(r), visits: num(r.visits) }));
  } catch (e) {
    errors.push({ source: 'fathom visits', message: e.message });
  }

  // Event definitions (events are addressed by id in the API).
  let events = [];
  try {
    events = await fathom.listEvents(siteId);
  } catch (e) {
    errors.push({ source: 'fathom events', message: e.message });
  }
  const ctaEvents = events.filter((ev) => String(ev.name).startsWith(CTA_PREFIX));
  const signupEvents = events.filter((ev) => String(ev.name).startsWith(SIGNUP_PREFIX));

  const eventRows = (ev, group) => fathom.aggregate({
    ...base, entity: 'event', entity_id: ev.id, aggregates: 'conversions,unique_conversions',
    date_grouping: 'day', ...(group ? { field_grouping: group } : {}), limit: 1000,
  });

  // CTA clicks: try a per-page split, fall back to totals if Fathom won't group events by page.
  if (ctaEvents.length) {
    let split = true;
    let results;
    try {
      results = await Promise.all(ctaEvents.map((ev) => eventRows(ev, 'pathname')));
    } catch (e) {
      split = false;
      notes.push('Fathom would not split button clicks by page, so clicks are shown without a page breakdown. (' + e.message.slice(0, 160) + ')');
      try {
        results = await Promise.all(ctaEvents.map((ev) => eventRows(ev, null)));
      } catch (e2) {
        errors.push({ source: 'fathom clicks', message: e2.message });
      }
    }
    if (results) {
      out.clicks = { split, rows: [] };
      results.forEach((rows, i) => rows.forEach((r) => out.clicks.rows.push({
        button: ctaEvents[i].name.slice(CTA_PREFIX.length).trim(),
        path: split ? normPath(r.pathname) : null,
        day: rowDay(r),
        n: num(r.conversions),
      })));
    }
  } else if (!errors.some((x) => x.source === 'fathom events')) {
    notes.push('No "CTA click: …" events have been recorded in Fathom yet.');
  }

  // /onepercent: visits per campaign + signups per campaign.
  const op = { visitRows: null, signupRows: null, campaignSplit: { visits: true, signups: true } };
  try {
    op.visitRows = (await fathom.aggregate({
      ...pv, date_grouping: 'day', field_grouping: 'utm_campaign', limit: 1000,
      filters: [{ property: 'pathname', operator: 'is', value: ONEPERCENT_PATH }],
    })).map((r) => ({ campaign: campaignName(r.utm_campaign), day: rowDay(r), visits: num(r.visits) }));
  } catch (e) {
    op.campaignSplit.visits = false;
    notes.push('Visits by campaign for ' + ONEPERCENT_PATH + ' are unavailable. (' + e.message.slice(0, 160) + ')');
    op.visitRows = pageRows
      .filter((r) => normPath(r.pathname) === ONEPERCENT_PATH)
      .map((r) => ({ campaign: null, day: rowDay(r), visits: num(r.visits) }));
  }
  if (signupEvents.length) {
    try {
      const res = await Promise.all(signupEvents.map((ev) => eventRows(ev, 'utm_campaign')));
      op.signupRows = [];
      res.forEach((rows) => rows.forEach((r) => op.signupRows.push({ campaign: campaignName(r.utm_campaign), day: rowDay(r), n: num(r.conversions) })));
    } catch (e) {
      op.campaignSplit.signups = false;
      notes.push('Signups by campaign are unavailable. (' + e.message.slice(0, 160) + ')');
      try {
        const res = await Promise.all(signupEvents.map((ev) => eventRows(ev, null)));
        op.signupRows = [];
        res.forEach((rows) => rows.forEach((r) => op.signupRows.push({ campaign: null, day: rowDay(r), n: num(r.conversions) })));
      } catch (e2) {
        errors.push({ source: 'fathom signups', message: e2.message });
      }
    }
  } else {
    op.signupRows = [];
  }
  out.onepercent = op;
  return out;
}

// ---------------------------------------------------------------- Stripe
async function loadStripe({ stripe, from, errors, notes }) {
  if (!stripe.configured) {
    errors.push({ source: 'stripe', message: 'STRIPE_SECRET_KEY is not set.' });
    return null;
  }
  const sinceEpoch = startOfDayEpochSec(from, TZ);

  let paymentLinkId = null;
  try {
    paymentLinkId = await stripe.findPaymentLinkId(PAYMENT_LINK_CODE);
    if (!paymentLinkId) notes.push('Could not match the Stripe Payment Link, so purchases include ALL paid Checkout Sessions on the account.');
  } catch (e) {
    notes.push('Could not look up the Stripe Payment Link, so purchases include ALL paid Checkout Sessions on the account. (' + e.message.slice(0, 160) + ')');
  }

  let promoMap = new Map();
  try {
    promoMap = await stripe.promotionCodeMap();
  } catch (e) {
    notes.push('Could not read Stripe promotion codes, so coupon names may be missing. (' + e.message.slice(0, 160) + ')');
  }

  let sessions;
  let expanded = true;
  try {
    sessions = await stripe.listSessions({ sinceEpoch, paymentLinkId, expandDiscounts: true });
  } catch (e) {
    expanded = false;
    notes.push('Stripe would not return discount details; coupon codes may show as "(code unknown)". (' + e.message.slice(0, 160) + ')');
    try {
      sessions = await stripe.listSessions({ sinceEpoch, paymentLinkId, expandDiscounts: false });
    } catch (e2) {
      errors.push({ source: 'stripe purchases', message: e2.message });
      return null;
    }
  }

  const purchases = [];
  for (const s of sessions) {
    if (s.status !== 'complete' || s.payment_status !== 'paid') continue;
    const discountAmount = num(s.total_details && s.total_details.amount_discount);
    let code = null;
    const breakdown = s.total_details && s.total_details.breakdown && s.total_details.breakdown.discounts;
    const list = (breakdown && breakdown.length ? breakdown.map((d) => d.discount) : (s.discounts || [])).filter(Boolean);
    for (const d of list) {
      const promo = d.promotion_code;
      const promoId = promo && typeof promo === 'object' ? promo.id : promo;
      const promoCode = promo && typeof promo === 'object' && promo.code ? promo.code : promoMap.get(promoId);
      code = promoCode || (d.coupon && (d.coupon.name || d.coupon.id)) || null;
      if (code) break;
    }
    if (!code) code = discountAmount > 0 ? '(code unknown)' : 'No code';
    purchases.push({
      day: dayKey(s.created * 1000, TZ),
      amount: num(s.amount_total) / 100,
      currency: String(s.currency || 'usd').toUpperCase(),
      code: /^(No code|\(code unknown\))$/.test(code) ? code : String(code).toUpperCase(),
    });
  }
  return { purchases, expanded };
}

// ---------------------------------------------------------------- Assemble
export async function buildDashboard(env, daysCount, opts = {}) {
  const fetchFn = opts.fetchFn || fetch;
  const now = opts.now ? new Date(opts.now) : new Date();
  const days = rangeDays(dayKey(now.getTime(), TZ), daysCount);
  const from = days[0];
  const to = days[days.length - 1];
  const errors = [];
  const notes = [];
  const siteId = (env && env.FATHOM_SITE_ID) || SITE_ID_DEFAULT;
  const base = { timezone: TZ, date_from: from + ' 00:00:00', date_to: to + ' 23:59:59' };

  const [fa, st] = await Promise.all([
    loadFathom({ fathom: makeFathom(env, fetchFn), siteId, base, errors, notes }).catch((e) => { errors.push({ source: 'fathom', message: e.message }); return { visits: null, clicks: null, onepercent: null }; }),
    loadStripe({ stripe: makeStripe(env, fetchFn), from, errors, notes }).catch((e) => { errors.push({ source: 'stripe', message: e.message }); return null; }),
  ]);

  // ---- visits (funnel pages only)
  const visitsByDay = new Map();
  const visitsByPage = new Map(FUNNEL_PAGES.map((p) => [p, 0]));
  if (fa.visits) {
    for (const r of fa.visits) {
      if (!visitsByPage.has(r.path)) continue;
      addTo(visitsByDay, r.day, r.visits);
      addTo(visitsByPage, r.path, r.visits);
    }
  }
  const visits = fa.visits ? {
    total: sum([...visitsByPage.values()]),
    byDay: toSeries(days, visitsByDay),
    byPage: FUNNEL_PAGES.map((p) => ({ page: p, value: visitsByPage.get(p) })),
  } : null;

  // ---- clicks
  let clicks = null;
  if (fa.clicks) {
    const byDay = new Map();
    const byPage = new Map(FUNNEL_PAGES.map((p) => [p, 0]));
    const byButton = new Map();
    for (const r of fa.clicks.rows) {
      addTo(byDay, r.day, r.n);
      addTo(byButton, r.button, r.n);
      if (fa.clicks.split) addTo(byPage, FUNNEL_PAGES.includes(r.path) ? r.path : 'other', r.n);
    }
    clicks = {
      total: sum([...byButton.values()]),
      byDay: toSeries(days, byDay),
      byPage: fa.clicks.split ? [...byPage.entries()].filter(([p, v]) => p !== 'other' || v > 0).map(([page, value]) => ({ page, value })) : null,
      byButton: [...byButton.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  } else if (fa.visits && !errors.some((x) => x.source.startsWith('fathom c') || x.source === 'fathom events')) {
    clicks = { total: 0, byDay: toSeries(days, new Map()), byPage: null, byButton: [] };
  }

  // ---- purchases
  let purchases = null;
  if (st) {
    const byDay = new Map();
    const revDay = new Map();
    const byCoupon = new Map();
    const byPage = new Map(FUNNEL_PAGES.map((p) => [p, { value: 0, revenue: 0 }]));
    let revenue = 0;
    let currency = 'USD';
    for (const p of st.purchases) {
      currency = p.currency;
      addTo(byDay, p.day, 1);
      addTo(revDay, p.day, p.amount);
      revenue += p.amount;
      const c = byCoupon.get(p.code) || { code: p.code, count: 0, revenue: 0 };
      c.count += 1; c.revenue += p.amount; byCoupon.set(p.code, c);
      const page = PAGE_BY_COUPON[p.code] || '/';
      const pg = byPage.get(page); pg.value += 1; pg.revenue += p.amount;
    }
    purchases = {
      total: st.purchases.length,
      revenue,
      currency,
      byDay: days.map((date) => ({ date, value: byDay.get(date) || 0, revenue: revDay.get(date) || 0 })),
      byPage: FUNNEL_PAGES.map((page) => ({ page, value: byPage.get(page).value, revenue: byPage.get(page).revenue })),
      byCoupon: [...byCoupon.values()].sort((a, b) => b.count - a.count),
    };
  }

  // ---- /onepercent
  let onepercent = null;
  if (fa.onepercent && (fa.onepercent.visitRows || fa.onepercent.signupRows)) {
    const o = fa.onepercent;
    const vDay = new Map(); const sDay = new Map(); const camp = new Map();
    const bump = (name) => { if (!camp.has(name)) camp.set(name, { campaign: name, visits: 0, signups: 0 }); return camp.get(name); };
    for (const r of o.visitRows || []) { addTo(vDay, r.day, r.visits); if (r.campaign !== null) bump(r.campaign).visits += r.visits; }
    for (const r of o.signupRows || []) { addTo(sDay, r.day, r.n); if (r.campaign !== null) bump(r.campaign).signups += r.n; }
    const visitsTotal = sum([...vDay.values()]);
    const signupsTotal = sum([...sDay.values()]);
    onepercent = {
      visits: visitsTotal,
      signups: signupsTotal,
      byDay: days.map((date) => ({ date, visits: vDay.get(date) || 0, signups: sDay.get(date) || 0 })),
      byCampaign: (o.campaignSplit.visits || o.campaignSplit.signups)
        ? [...camp.values()].sort((a, b) => b.visits - a.visits || b.signups - a.signups) : null,
    };
  }

  const secrets = [env && env.FATHOM_API_KEY, env && env.STRIPE_SECRET_KEY, env && env.DASHBOARD_PASSWORD].filter(Boolean);
  const clean = (s) => secrets.reduce((acc, sec) => acc.split(sec).join('[redacted]'), String(s));
  return {
    generatedAt: now.toISOString(),
    range: { days: daysCount, from, to, tz: TZ },
    funnel: { visits, clicks, purchases },
    onepercent,
    pageByCoupon: PAGE_BY_COUPON,
    notes: notes.map(clean),
    errors: errors.map((e) => ({ source: e.source, message: clean(e.message) })),
  };
}
