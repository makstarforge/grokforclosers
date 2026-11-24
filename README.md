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

## /dashboard/kit-attribution (read-only diagnostic)

Behind the dashboard login. Enter a subscriber's email and it asks Kit's v4 API (GET requests only, using the `KIT_API_KEY` secret) whether the subscriber's native attribution (UTM source/campaign) is returned, with and without `include=attribution`, on both the lookup-by-email and the individual-subscriber endpoints. It shows the subscriber ID, the HTTP statuses, the raw response JSON and a YES/NO verdict, and which read operations the key is allowed. It creates, changes and deletes nothing, and the key is never displayed.

## Automatic campaign tags (Kit webhook)

After someone subscribes to the course form (Kit form `10176758`), a Kit webhook calls `/api/kit-webhook`. It reads the subscriber's **native Kit attribution** (`GET /v4/subscribers/{id}?include=attribution`, fields `subscriber.attribution.utm_source` and `utm_campaign`), builds a lower-case tag `{utm_source}-{utm_campaign}` (e.g. `webinar` + `steckler` = `webinar-steckler`), finds that tag in Kit (creating it only if missing) and applies it. New campaigns work automatically.

It is independent of the landing page and signup: it only runs after the subscription, answers Kit immediately and works in the background, so it can never affect signup, the redirect or the email course. Kit's attribution is how the subscriber was **originally acquired**, so the tag reflects original acquisition, not necessarily the latest form submitted.

**Rules and safeguards**
- Skipped (after up to 4 looks over about 22 seconds, in case Kit attaches attribution a moment late) if `utm_source` or `utm_campaign` is missing. Values that are too long (over 40 characters after cleaning) or unusable are skipped at once.
- Tag names are lower-case and limited to letters, numbers, `-` and `_`.
- No new tag is created when the account already has `KIT_MAX_TAGS` tags (default 500) or after `KIT_MAX_NEW_TAGS_PER_HOUR` new tags in an hour (default 10, per Cloudflare data centre). Existing tags keep working.
- Duplicates: looking a tag up and applying it are idempotent; simultaneous signups from one new campaign end up with one tag (if Kit ever allowed duplicate names, the lowest-id tag is used); repeat deliveries are skipped for 90 seconds.
- Kit errors are retried with backoff (429 honours `Retry-After`, capped at 8 seconds); every attempt is bounded.
- Security: the endpoint fails closed unless `KIT_WEBHOOK_SECRET` (16+ characters) is set, compares the `?token=` in constant time, and trusts nothing in the payload except the subscriber id; everything else is read from Kit's API. Logs contain the subscriber id, tag and outcome, never emails or keys.

**Cloudflare secrets** (Production; redeploy after changing): `KIT_API_KEY` (already set), `KIT_WEBHOOK_SECRET` (new, 32+ random characters). Optional: `KIT_MAX_TAGS`, `KIT_MAX_NEW_TAGS_PER_HOUR`, `KIT_FORM_ID`.

**Kit webhook:** open `/dashboard/kit-tagging` (dashboard login) on grokforclosers.com. "Tag one subscriber now" runs the logic for a subscriber ID and shows every step; "Register webhook" registers `subscriber.form_subscribe` for form `10176758`, pointing at `https://grokforclosers.com/api/kit-webhook?token=...` (the token is never displayed). Outcomes are logged as `{"evt":"kit-tag", ...}` in Cloudflare's function logs.

