# Collapse Technologies (Studio Site)

Landing site for the studio at [collapsetechnologies.com](https://collapsetechnologies.com):
an independent technology studio making software, games, and long-term platforms.

**Live:** https://collapsetechnologies.com

## Stack

- Next.js static export (`output: "export"`) — light cream/paper theme,
  Space Grotesk via CSS variable. This site's palette is the design reference
  for sibling apps (`collapse-health`, `dress-like-me`).
- Hosted on Cloudflare Pages (static export, no Worker needed — the site has
  no server-side behavior). DNS zone lives on Cloudflare: apex and `www` are
  proxied CNAMEs to `collapse-technologies.pages.dev`.

## Local development

```bash
npm install
npm run dev
```

From the repo root: `npm run dev:studio`.

To preview the static production export locally:

```bash
npm run build
npm start
```

## Build & deploy

Static export — deploy `out/`, never `.next/`:

```bash
npm run build
npx wrangler pages deploy out --project-name collapse-technologies --branch main --commit-dirty=true
```

Formerly hosted on Vercel — fully retired from Vercel (Aug 2026); the project
and its stale `vercel.json` were deleted. Cloudflare Pages is the only host.

This app uses no environment variables or secrets — keep Supabase/Worker
credentials scoped to their own apps.
