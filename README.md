# FLASH GEAR BD — FGBD V1.0.10

## What is new
- Private mobile-first Admin Panel at `/admin`
- Admin login with password hashing and failed-login lockout
- Change admin password from the panel
- Product Manager: add, edit, publish/hide, delete
- Multi-variant product editing with SKU, price, stock and image URLs
- Inventory/stock adjustment
- Order Manager with status management
- Courier + tracking ID management
- Order status/activity log in `Order_Log`
- Customer list
- Category Manager
- Store settings manager
- Dashboard KPIs and stock alerts
- Existing public storefront/API preserved

## Important: Google Apps Script update
Replace your current Apps Script code with:
`Flash_Gear_BD_AppsScript_V1.0.10.gs`

The script keeps your current spreadsheet ID and existing public API behavior. It adds the admin API and `Order_Log` sheet.

After pasting the full script:
1. Save.
2. Run `setupStore()` once.
3. Authorize Google when prompted.
4. Deploy the Apps Script web app as a new version of the same deployment.
5. Keep the same Web App URL.
6. Keep `FGBD_API_KEY` in Script Properties unchanged.

## Cloudflare
Deploy this package to the same Cloudflare Worker/GitHub project.
The Worker serves `/admin` as the admin panel and keeps `/api` routed to the Apps Script backend.
Keep these Cloudflare Production secrets unchanged:
- `APPS_SCRIPT_URL`
- `FGBD_API_KEY`

## First admin login
The first time you open `/admin`, use username `admin` and any password attempt. The backend will create a one-time initial password and display it on the login screen.
Save that password, log in, then immediately use **Settings → Change admin password**.

The generated initial password is stored only as a hash after setup; it is not kept in plain text.

## Admin URL
`https://flash-gear-bd.fgbd.workers.dev/admin`

## File structure
All website files are kept in the project root. No `assets` folder is used.


## V1.0.10
- Fixed `/admin`, `/admin/`, and `/admin.html` routing to avoid redirect loops.
- Admin CSS, JS, and logo now use absolute root paths.
- API routing remains unchanged.
