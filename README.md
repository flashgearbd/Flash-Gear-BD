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
