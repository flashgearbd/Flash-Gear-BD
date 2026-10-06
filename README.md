# Flash Gear BD — FGBD V1.0.22

## V1.0.22 authentication/redirect fix

This version keeps all V1.0.21 website/admin/inventory fixes and targets the remaining `Backend returned an invalid response for adminLogin` problem.

### Changes
- Cloudflare Worker now uses standard Fetch redirect following for Google Apps Script Web App responses.
- This targets the Apps Script POST -> 302 -> ContentService JSON response flow used by `adminLogin` and other POST actions.
- Upstream JSON parsing is UTF-8 BOM safe.
- Invalid upstream responses now expose HTTP status, content type, and a safe response snippet for diagnosis.
- Admin UI now displays backend diagnostic detail instead of hiding it behind the generic error message.
- Existing API key handling remains: `FGBD_API_KEY` is sent to Apps Script in the query string and POST body, while the secret remains in Cloudflare/App Script configuration rather than GitHub.

## Included
- Automatic Product IDs, SKUs and Variant IDs.
- Product/variant management, stock, pricing, categories, suppliers, purchases, expenses and reports.
- Admin login/session management, failed-login lockout, password change and activity log.
- Live Google Sheets catalog and order backend.
- Customer checkout, order tracking, delivery calculation and payment methods.
- Product image upload/Drive thumbnail handling.
- Live search suggestions.
- Mobile-first customer and admin UI.
- No `assets` folder.

## Deployment

1. Replace the Apps Script project code with the full `Flash_Gear_BD_AppsScript_V1.0.22.gs` file.
2. In Apps Script, run `setupStore()` once if required. It preserves existing data and creates missing headers/categories.
3. Deploy the Apps Script as a new Web App version using the same Web App URL/access settings.
4. Deploy the Cloudflare Worker/site from this package to the production `main` branch.
5. Keep the existing Cloudflare secrets:
   - `APPS_SCRIPT_URL`
   - `FGBD_API_KEY`
6. Keep the same Apps Script Script Property:
   - `FGBD_API_KEY`

## Important

Do not put Google credentials or API secrets into GitHub. The `.gs` file is the application source/reference; Cloudflare secrets and Apps Script Script Properties hold the sensitive API key.
