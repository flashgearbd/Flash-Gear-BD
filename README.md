# Flash Gear BD — V1

Production-hardened Flash Gear BD storefront + Cloudflare Worker + Google Apps Script backend.

## Important Cloudflare deployment layout

**Keep every file in the repository root. Do NOT create a `public` folder.**

This package uses the repository root as the Workers Assets directory and `.assetsignore` to prevent server-side/project files from being uploaded as public assets. This avoids the `The directory specified by the assets.directory field does not exist` deployment error.

Run:

```bash
npx wrangler deploy
```

Cloudflare variables/secrets:
- `APPS_SCRIPT_URL`
- `FGBD_API_KEY`
- `PUBLIC_ORIGIN` = `https://flash-gear-bd.fgbd.workers.dev`

Google Apps Script Script Property:
- `FGBD_API_KEY`

Apps Script:
- `Flash_Gear_BD_AppsScript_V1.gs`
- Run `setupStore()` once if the Sheets structure has not already been initialized.

## Public assets vs server files

Public website files: `index.html`, `app.js`, `admin.html`, `admin.js`, `styles.css`, `admin.css`, `config.js`, images, `robots.txt`, `sitemap.xml`, `404.html`.

`.assetsignore` excludes:
- Cloudflare Worker source
- Google Apps Script source
- Wrangler configuration
- README/project files

## Security hardening

- Public catalog is Published-only.
- Admin mutations require an authenticated admin session.
- Direct public order/stock mutation endpoints are blocked.
- Passwords, API keys and session tokens are sent in POST bodies, not query strings.
- Checkout has a honeypot and Worker-side rate limiting.
- CORS is restricted to the configured storefront origin.
- Stock availability is always derived as `Stock - Reserved`.
- Product saves use a script lock and preserve live stock.
- Product variants removed from the editor are archived instead of deleted.
- Admin login failures are rate-limited per client instead of globally locking every administrator out.
- Product API responses are edge-cached for 30 seconds.

## Product Manager

Image uploads synchronize the currently typed variant fields before re-rendering, so prices, stock, variant names and other values do not reset while choosing photos.

## Customer storefront

- Live product catalog
- Functional search and shop filters
- Deals / New Arrivals / Best Sellers collections
- Functional hero slider
- Live delivery charge calculation
- Transaction ID for non-COD payments
- Optional payment screenshot
- Persistent order confirmation with item list
- Order tracking with terminal-status timelines
- Recently viewed products
- Terms, Privacy and Returns pages
- Responsive mobile navigation

## Testing performed

- JavaScript syntax checks for Worker, storefront and admin scripts
- Apps Script syntax compatibility check
- Worker security unit tests for public mutation blocking, GET admin blocking, CORS and edge caching
- Asset-layout validation for `.assetsignore`
- Sensitive URL pattern scan
- Hardcoded payment/logo URL scan
- Deprecated/fake feature string scan
- Image asset optimization
- ZIP integrity validation before delivery
