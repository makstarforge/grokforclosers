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

## /onepercent: UTM capture and Kit tags

The signup form on `/onepercent` still posts straight to the Kit form (id `10176758`). When the landing URL has `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` or `utm_term`:

- On submit the page lets the browser send the **full landing URL** to Kit as the referrer (for this one navigation), so Kit's own attribution can read the UTMs. Whether Kit fills its attribution fields from that is Kit's behaviour; check a test subscriber in Kit.
- If **both** `utm_source` and `utm_campaign` are present, the page also calls `/api/kit-utm`, which tags the new subscriber `<utm_source>-<utm_campaign>` (lower-case; for example `?utm_source=webinar&utm_campaign=steckler` gives `webinar-steckler`). The function looks the tag up first and only creates it if it is missing. It only tags people who signed up in the last 30 minutes.
- With no UTMs, nothing changes.

Tagging needs one more secret on the Pages project: `KIT_API_KEY` (a Kit v4 API key from Kit's developer settings). Without it, tagging is simply off and signups work as before. After adding it, open `/dashboard/diag?kit` (logged in) for a read-only check of the key.
