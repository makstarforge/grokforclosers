# Grok for Closers

Landing page for grokforclosers.com.

Static site, no build step: `index.html`, `terms.html`, `privacy.html`, `tristan.jpg`.

Deploy on Cloudflare Pages: connect this repo, leave the build command empty, set the output directory to `/`.

## /dashboard (private KPI dashboard)

A password-protected page at `/dashboard`: visits, clicks and purchases (with by-day, by-page and by-coupon breakdowns) plus a separate `/onepercent` breakdown by campaign.

It runs as a Cloudflare Pages Function (`functions/`), so the password and API keys stay on the server. Set these under Workers & Pages > grokforclosers > Settings > Variables and Secrets (as **Secrets**, for Production and for Preview if you want to test previews):

| Name | What it is |
|---|---|
| `DASHBOARD_PASSWORD` | Password for the login. Username is `admin` (override with an optional `DASHBOARD_USER`). If this is missing the dashboard refuses everyone. |
| `FATHOM_API_KEY` | Fathom API token (visits, clicks, signups). |
| `STRIPE_SECRET_KEY` | Stripe key (a restricted read-only key is best) for purchases and coupon codes. |

Numbers are bucketed in Eastern time. Never commit real keys to this repo.

## /onepercent: UTM links sign up through our server

Normal signups (no UTMs in the link) post straight to the Kit form (id `10176758`), exactly as before.

When the landing URL has any of `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (remembered for the browser tab), the page signs the person up through `/api/subscribe` instead:

- Our server adds them to the **same Kit form** through Kit's API (so the course automation runs), with no reCAPTCHA step, passes the full landing URL to Kit as the `referrer`, and then applies the tag `<utm_source>-<utm_campaign>` (lower-case; `?utm_source=webinar&utm_campaign=steckler` gives `webinar-steckler`) if both are present. The tag is looked up first and only created if it does not exist.
- On the thank-you page redirect it goes to `https://one-percent-closer.vercel.app/youre-in` (the page Kit's form redirects to). Update `THANK_YOU_URL` in `onepercent.html` if that page moves.
- **Anything goes wrong** (Kit error, server unreachable, 12 s timeout, rate limit) and the page falls back to the normal post to Kit, so a signup is never lost. The fallback also sends the older best-effort `/api/kit-utm` tag request.
- Spam protection: this path does not go through Kit's reCAPTCHA. It is limited to 6 signups per address and 2 per email per 10 minutes, ignores sub-second submits, and only accepts requests from our own pages. For heavy traffic, add Cloudflare Turnstile and a Cloudflare rate-limit rule on `/api/subscribe`.

Needs the `KIT_API_KEY` secret (a Kit v4 API key) on the Pages project, Production. Without it everything uses the normal post. `/dashboard/diag?kit` (logged in) is a read-only check of the key.
