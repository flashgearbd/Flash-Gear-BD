# Flash Gear BD — V1.0.24

Customer website redesign based on the approved blue premium electronics-store pattern.

## V1.0.24 design changes
- Complete blue/navy/white storefront redesign
- New announcement strip, header, search placement, navigation and hero layout
- Blue promotional cards, featured/deal/new-arrival sections and popular gadgets
- Text-only category presentation
- Search remains in the main header only; it is NOT in the bottom dock or navigation
- Mobile bottom dock: Home, Categories, Cart, Orders
- Responsive mobile-first layout
- Existing live Google Sheets product data preserved
- Existing checkout, delivery, payment and tracking flows preserved
- Existing V1.0.23 Admin/Apps Script backend preserved unchanged
- No assets folder

## Deployment
Upload all files in this folder to the repository root and deploy the same Cloudflare Worker. Do not change APPS_SCRIPT_URL or FGBD_API_KEY. The Apps Script backend remains the working V1.0.23 version.
