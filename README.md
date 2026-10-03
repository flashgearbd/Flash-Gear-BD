# Flash Gear BD — Website Starter

## Current status
This is the first customer-facing frontend build for Flash Gear BD.

### Included
- Mobile-first blue + off-white premium design
- Flash Gear BD logo
- Homepage
- Shop/category browsing
- Search
- Product details
- Cart
- Checkout UI
- COD, bKash, Nagad, Upay, Bank Transfer UI
- Order confirmation
- Order tracking UI
- Account area
- Support
- FAQ
- Recently viewed concept
- In Stock / Low Stock / Out of Stock customer display
- No wishlist
- No customer reviews
- Product image fields are designed to come from Google Sheet later
- Local demo cart using browser storage

### Backend status
Apps Script is NOT connected yet. `config.js` has an empty API URL and mock products are used for the visual/functional frontend.

### Next integration
When the Google Sheet + Apps Script backend is confirmed and built, the frontend can replace mock product/order functions with API calls.

## Cloudflare/GitHub
This project is plain HTML/CSS/JS and can be placed in a GitHub repository. The final Cloudflare Worker deployment structure can be added after the API layer is ready.
