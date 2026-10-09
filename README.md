# Flash Gear BD — V1.2 Final Release (Redirect Loop Fixed)

## Deployment note
This build intentionally does NOT include a `_redirects` file. The project is deployed as a Cloudflare Worker with Static Assets (`wrangler.jsonc`), and SPA routing is handled explicitly by `flash-gear-bd-worker.js` for `/`, `/index.html`, `/product`, and `/product/*`.

The previous Pages `_redirects` rule `/* /index.html 200` is rejected by Cloudflare in this Worker/Pages configuration as an infinite/self-targeting redirect. Do not re-add it to the root.

Deploy with:
`npx wrangler deploy`

Supported SPA entry points:
- `/`
- `/product?id=XYZ`
- `/product/XYZ`
- `/shop`
- `/offers`
- `/new`


## Google Drive image requirements

Image URL normalization now supports common Drive sharing URLs, direct IDs, IMAGE() formulas, thumbnail URLs, and googleusercontent URLs, with fallback candidates in the storefront and admin. The underlying file must still be accessible to the intended viewer (typically General access: Anyone with the link, Viewer). URL conversion cannot bypass a private Drive file or Google Workspace access restrictions.
