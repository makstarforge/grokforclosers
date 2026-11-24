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
