# Vendored UI runtime assets

The standalone design (`/design/construction-dx-idea.html` + `support.js`)
previously loaded React and ReactDOM from `unpkg.com`. These files are now
served from the same Cloudflare Worker origin to remove the runtime CDN
dependency (site-network restrictions, offline use, supply-chain reduction).

## Files

| File | Origin | License | SRI (sha384) |
|---|---|---|---|
| `react.production.min.js` | https://unpkg.com/react@18.3.1/umd/react.production.min.js | MIT | `DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z` |
| `react-dom.production.min.js` | https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js | MIT | `gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1` |

## Update procedure

1. Download the new UMD production files from the official package versions.
2. Verify `openssl dgst -sha384 -binary <file> | base64` matches the SRI in
   `support.js` and this README, then update both.
3. Run `npm run verify` and confirm `dist/design/vendor/*` is emitted.

## Note

`@babel/standalone` is still fetched from unpkg when an `x-import` component
with JSX is used. The current design uses no `x-import`, so Babel is never
loaded. Vendor Babel here before introducing `x-import` usage.
