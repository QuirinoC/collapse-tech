# Shared mural seed packs

Original **CC0-style** pixel art for Infinite Pixelboard’s collaborative board.
No copyrighted characters, logos, or franchise IP — only geometric, nature, and classic public-domain motifs (heart, meander, rainbow arc, etc.).

## Coordinates (row, column = top-left origin of each pack)

| Pack | Title | Origin (row, col) | Region |
| --- | --- | --- | --- |
| `welcome-compass` | Welcome compass rose | (-40, -40) | NW of origin |
| `geometric-sun` | Geometric sun | (-55, 20) | N |
| `pine-grove` | Pine grove | (25, -60) | SW |
| `crescent-sky` | Crescent and stars | (-70, -10) | Far N |
| `mountain-range` | Mountain range | (40, 30) | SE |
| `abstract-flower` | Abstract six-petal | (-20, 50) | NE |
| `simple-heart` | Classic heart motif | (10, 10) | Near origin SE |
| `leaf-pair` | Paired leaves | (55, -25) | S |
| `fish-silhouette` | Abstract fish | (-15, -80) | W |
| `bird-perch` | Geometric bird | (-80, 45) | Far NE |
| `rainbow-arc` | Rainbow arc | (70, 50) | Far SE |
| `quilt-block` | Quilt checker 12×12 | (-30, 80) | E |
| `concentric-nest` | Concentric nest | (80, -70) | Far SW |
| `diamond-field` | Diamond tessellation | (-100, -50) | Far NW |
| `wave-banner` | Wave banner | (100, -40) | Far S |
| `color-spiral` | Palette spiral | (-5, 100) | Far E |
| `house-silhouette` | Simple house | (20, -100) | Far W |
| `star-cluster` | Star cluster | (-90, 80) | Far NE |
| `cross-stitch-frame` | Cross-stitch frame | (110, 20) | Far S |
| `meander-border` | Greek-key meander | (-120, 10) | Far N |
| `tulip-row` | Tulip row | (5, -35) | Near origin W |
| `boat-horizon` | Boat on horizon | (90, 90) | Far SE |
| `mushroom-pair` | Forest mushrooms | (35, 70) | E |

Exact bounding boxes and pixel counts live in [`catalog.json`](./catalog.json) after generation.

## Regenerate packs

```bash
node apps/infinite-pixelboard/tools/mural-seed/generate-packs.mjs
```

## Seed local board

With `npm run dev:pixelboard` running:

```bash
npm run pixelboard:seed-mural
# or one pack:
node apps/infinite-pixelboard/tools/mural-seed/seed-mural.mjs --pack geometric-sun
```

Uses Development-only `POST /api/local/pixel-art`.

## Seed production (moderator)

Requires a Firebase ID token with `moderator=true` (see [MODERATION_RUNBOOK.md](../../docs/MODERATION_RUNBOOK.md) and README moderator provisioning).

```bash
export PIXELBOARD_URL=https://pixelboard.collapsetechnologies.com
export PIXELBOARD_ID_TOKEN='<moderator-id-token>'
npm run pixelboard:seed-mural -- --production
```

Posts to `POST /api/v1/moderation/pixel-art` in chunks of 4,000 pixels.

## License

All sprites in this folder are original works intended as **CC0 / public-domain dedication**. Do not add third-party or copyrighted art.
