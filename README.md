# Flash Gear BD — V1.0.6

## Cloudflare Worker API routing
The Worker now supports both API URL formats:
- `/api?action=health`
- `/api?action=products`
- `/api/products`

The website can keep using `/api?action=...`. API requests are intercepted before the static website SPA fallback and forwarded securely to the Google Apps Script Web App using the Cloudflare secrets `APPS_SCRIPT_URL` and `FGBD_API_KEY`.

## Secrets
Configure these in Cloudflare Worker → Settings → Variables and Secrets → Production:
- `APPS_SCRIPT_URL` — Google Apps Script Web App `/exec` URL
- `FGBD_API_KEY` — the same secret stored in Apps Script Script Properties

Do not commit or expose the API key in GitHub.

## Bangladesh Delivery Address
The checkout collects Division, District and Full Delivery Address. It does not collect Area/Thana. District choices are dynamically filtered by the selected division using the current Bangladesh National Portal list of 8 divisions and 64 districts.

Current delivery-zone fallback without Area/Thana: Chattogram District = ৳60; all other districts = ৳120.
