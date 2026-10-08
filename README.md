# Flash Gear BD — V1.0.30

Customer website update based on V1.0.26.

Changes:
- Fixed automatic scroll-to-top caused by live product refresh/render. Page navigation still starts at top.
- Removed FAQs from the mobile side drawer.
- Featured Products and New Arrivals on the Home page now use one-by-one horizontal auto-sliders with a short delay.
- Sliders support touch swipe on mobile and mouse/pointer drag on desktop.
- Auto-slide pauses briefly after manual interaction.
- Product cards now have +/- quantity controls so customers can add multiple units directly without opening product details.
- Product detail Add to Cart/Buy Now now respects its selected quantity too.
- Existing V1.0.23 backend/authentication and V1.0.26 mobile dock structure are preserved.
- No assets folder.


## V1.0.28 Image Fix
- Normalizes common Google Drive/Sheets image URL formats, including IMAGE("url") cells.
- Fixed image frames across product cards, sliders, search suggestions, cart, thumbnails, and product detail.
- Product images use contain positioning and blend with the site background frame.
- Backend/authentication baseline remains V1.0.23.


## V1.0.30 fixes
- Preserve scroll position during non-navigation re-renders to prevent bottom-to-top bounce-back.
- Reset scroll only on real hash navigation.
- Added multiple Google Drive image URL candidates and retry-on-error image loading.
- Supports Drive file/open/uc/thumbnail URLs, Drive IDs, googleusercontent URLs, and IMAGE("URL") cells.
- Preserves fixed image frames and blended backgrounds from V1.0.28.


## V1.0.30 security baseline
- Static website files are served only from `public/`; source/config files remain outside the public asset directory.
- Direct order-status/courier/stock mutation endpoints are disabled; admin session endpoints are required.
- Public catalog is Published-only.
- Available Stock is derived as Stock minus Reserved.
- Checkout has Worker rate limiting and a honeypot.
- CORS is restricted to PUBLIC_ORIGIN (defaults to the Worker origin).
- Worker-to-Apps-Script API credentials are sent in POST bodies rather than URLs.
- Product saving uses a script lock and preserves live stock for existing variants.
