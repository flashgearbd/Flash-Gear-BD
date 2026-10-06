# Flash Gear BD — FGBD V1.0.20

Major admin and inventory upgrade for Flash Gear BD.

## Included
- Automatic Product IDs.
- Automatic SKU generation by category; existing SKUs are preserved when editing existing variants.
- Automatic Variant IDs.
- New and edited products are physically moved to the top of the Products sheet and sorted first in the admin UI.
- Stock adjustments move the edited SKU/product to the top.
- Native mobile gallery picker for product images; no image URLs are required in the admin UI.
- Up to 4 images per variant with preview and removal.
- Product duplication.
- Draft / Published / Hidden / Archived product states.
- Automatic profit and margin preview.
- Variant-specific pricing, cost, stock, reorder level and offer price.
- Categories are initialized automatically and can be added, edited, renamed, hidden and deleted.
- Orders are sorted by most recently updated.
- Customers are sorted by latest order.
- Dashboard profit metric.
- Order item cost-price capture for profit reporting.
- Low/out-of-stock alerts.
- Admin activity logging.
- Existing Cloudflare Worker + Google Apps Script + Google Sheets architecture retained.
- No `assets` folder.

## Important
1. Replace the deployed Apps Script code with the full `Flash_Gear_BD_AppsScript_V1.0.20.gs` file.
2. Run `setupStore()` once in Apps Script after updating the code. This adds any missing headers and initializes default categories without deleting existing data.
3. Deploy the Apps Script web app as a new version using the same web-app URL/access settings.
4. Replace the website/admin files in GitHub with this package and deploy through Cloudflare.
5. Existing Cloudflare `APPS_SCRIPT_URL` and `FGBD_API_KEY` settings remain the same.

## SKU examples
- Charger -> `FGBD-CHG-0001`
- Cable & Adapter -> `FGBD-CAB-0001`
- Earbuds -> `FGBD-EAR-0001`

SKU is an internal inventory code and does not need to be typed by the admin.


## V1.0.20 compatibility fix
- Fixed the Apps Script parse error caused by the `??=` operator.
- Dashboard order grouping now uses Google Apps Script-compatible syntax.
- No database reset is required.


V1.0.20 image improvements: client-side image compression, batched Drive upload, Drive thumbnail URLs, lazy loading, immediate local previews, and image fallback normalization.


V1.0.20 customer website refresh: clean text-only categories, improved product gallery/image handling, bKash/Nagad branded payment options, Upay removed, improved search suggestions, cleaner mobile storefront and performance-oriented image loading.

## FGBD V1.0.20 fixes
- Production catalog now uses the live Google Sheets API and does not silently fall back to demo products.
- Cloudflare API gateway normalizes invalid upstream responses into readable JSON errors.
- Admin API client now reports the actual backend/API error instead of a raw JSON.parse error.
- Header search now shows up to 5 matched product suggestions while typing.
- Matching checks product name, brand, category, subcategory and SKU. Example: `an` can match `Anker`; `anti` will not match `Anker` because `anti` is not present in the product text.


## V1.0.20 fixes
- Live catalog only; stale demo products are not used.
- Product image fallback no longer exposes broken HTML text.
- Shipping calculation uses an explicit `shipping` value and returns both `shipping` and `delivery`.
- Order confirmation shows subtotal, delivery and total.
- Mobile bottom navigation is fixed, compact, floating, and positioned above the safe-area/gesture region.
- Search suggestions remain live and rank up to 5 matching products while typing.


## V1.0.20 authentication fix

The Cloudflare Worker now preserves POST requests across Google Apps Script Web App redirects, sends the API key in both the query string and POST body, trims key whitespace, and returns a specific authorization diagnostic. The Apps Script API key comparison also trims both values and reports whether the key is missing or mismatched.
