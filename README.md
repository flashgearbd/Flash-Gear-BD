# Flash Gear BD — V1.0.26

Customer website redesign based on the approved blue premium electronics-store pattern.

## V1.0.26 design changes
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


V1.0.26 storefront UI changes: removed the Up to 50% OFF promotional box; added a mobile left slide-out menu opened from the hamburger button with backdrop and close control; removed the mobile inline navigation dropdown; implemented the mobile bottom dock outside the animated app root so it remains persistently fixed on every page, including immediately on homepage entry; the dock is positioned above the viewport safe area. Backend and Apps Script remain based on V1.0.23.


V1.0.26 dock fix: the mobile bottom navigation is rendered into a dedicated root outside #app. This prevents the page-entry animation/transform from affecting fixed positioning. The dock is always visible on mobile at the bottom of the viewport and remains above the browser/gesture safe area.
