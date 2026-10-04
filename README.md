# Flash Gear BD — FGBD V1.0.3

## This update
- Hero background added from the supplied Flash Gear BD hero image.
- Hero image fades smoothly into the off-white page background at the bottom.
- Mobile bottom navigation is now smaller, floating, fixed and glass-like.
- Search remains in the upper pill-shaped header search bar; no Search item is in the bottom dock.
- Checkout now requires Full Name, Mobile Number, Division, District, Area/Thana and Full Delivery Address.
- Mobile number uses a fixed `+88` prefix and requires exactly 11 digits beginning with `01`.
- Invalid phone input gets a red border/shadow.
- Place Order stays disabled until every required checkout field is valid.
- Validation highlights only the relevant missing/invalid field instead of turning every field red.
- Mobile and Feature Phone categories show Coming Later messaging.
- Gadget & Accessories exposes the confirmed subcategories.
- Delivery messaging and the previously supplied shop contact/payment information have been added to customer-facing areas.
- No `assets` folder; website files remain in the project root.

## Files
- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `flash-gear-logo.png`
- `hero-background.png`

Backend/API connection is still intentionally separate until the Apps Script backend is connected.
