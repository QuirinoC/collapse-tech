# jointrust.app

Public landing for **Trust Circle** at [jointrust.app](https://jointrust.app).
Paper/ink lockup matches the iOS login: Playfair italic for **Trust** (Didot on device),
Space Grotesk for Collapse Technologies, system UI for the rest, abstract atlas canvas.

Legal copy stays on the live studio URLs until this host has its own.

## Deploy

Direct upload — no git commit required:

```bash
npx wrangler deploy --config apps/jointrust-web/wrangler.jsonc
```

Apex and `www` are Worker custom domains (proxied). `www` 301s to `https://jointrust.app`.
