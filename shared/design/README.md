# Collapse web design

This is the current source of truth for Collapse's public web identity. It
supersedes the former cream-paper, Space Grotesk, compressed corporate wordmark,
acid-accent, rounded-card, and ambient space-animation direction.

The design takes its proportions from architectural inscriptions: broad fields,
deliberate alignment, clear lettering, fine rules, and depth made by light.
Use limestone and warm white for surfaces, charcoal for text, bronze for the
publisher identity, and restrained oxidized red for emphasis. Keep project art
and functional signals meaningful to the product.

## Typography and mark

`roman.css` defines the materials, font roles, and `.collapse-wordmark`. Use two
direct spans, “Collapse” and “Technologies,” with that class. Its arch comes from
`mark.svg`; do not recreate the former compressed, uppercase publisher logo.

Michelangelus is preferred when already installed. The [Microsoft download](https://www.microsoft.com/en-us/download/details.aspx?id=108856)
does not grant distribution rights, so its binaries must not be bundled or
converted into webfonts. The shipped fallback is [Marcellus](https://github.com/google/fonts/tree/main/ofl/marcellus),
with its unchanged SIL OFL in `fonts/OFL-Marcellus.txt`. Interface controls use
the interface font; keys, hashes, and measurements use the detail font.

Use large inscription headings with comfortable line height. Small meaningful
labels remain readable; avoid extreme negative tracking and synthetic heavy
serifs. Motion should reveal structure, stop after serving its purpose, and
respect `prefers-reduced-motion`. Content stays visible when scripts fail.

## Applications

- The studio, Dress Like Me, Collapse Health, and Asymmetric Challenge import
  the canonical CSS directly. Their product layout and capabilities remain
  specific to each application.
- Infinite Pixelboard uses the shared publisher mark, materials, and legal
  typography. Its Docker build uses a standalone app directory, so checked-in
  copies live in `wwwroot/design`. The canvas, pixel palette, and controls keep
  their functional geometry.
- CoachGG, The Fly, and the canonical Trust website have independent product
  identities. Trust's current source is in `QuirinoC/trust`; the copies and design
  mocks remaining in this repository are historical references, not brand rules.
- Native apps are separate platform releases; their historical font assets do
  not define the current website design.

Run `npm run sync:design` after changing shared assets, then `npm run check:design`
before building or deploying. The sync also includes the OFL at
`/licenses/Marcellus.txt` in each app's public distribution.
