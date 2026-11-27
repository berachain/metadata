---
name: generate-vault-pair-image
description: Generate deterministic Berachain vault, pool, or LP icons from one to four token logos using the Bera Design System layouts. Use for repo-ready 1024x1024 vault assets or rebuilding blurry request icons from clean token images.
---

# Generate Vault / LP Icons

Use the bundled Sharp script, not generative image AI. Run it from a repository with `sharp` installed. Preserve original token artwork and use official or existing repository assets instead of upscaling blurry request images.

## Layout and inputs

The bundled SVG masks define 64px layouts and are scaled to 1024px. Each logo fills the entire canvas before masking; do not shrink whole logos into individual segments. No outer ring or divider is added.

| Count | Input order |
| --- | --- |
| 1 | Full icon |
| 2 | Upper-left/base, lower-right/side (diagonal split) |
| 3 | Lower-right, top, lower-left |
| 4 | Bottom-right, top-right, top-left, bottom-left |

Choose and document token ordering from the request; do not silently sort addresses. The table defines the three- and four-token input order.

The design uses circular clipping. Repository outputs deliberately use opaque square backgrounds extending each segment to the canvas edges; the consuming UI can crop them to a circle. The bundled circular logo masks and square background shapes preserve the design inside that circle.

Supply a brand background for each token, especially for transparent or circular source images. Use official colors or verified source backgrounds; do not apply the reference BERA/BGT colors to unrelated tokens. If colors are unavailable, the explicit fallback is white. `--fit cover` matches Figma; `contain` avoids cropping non-square source artwork when needed.

## Generate

```bash
node skills/generate-vault-pair-image/scripts/generate_pair_image.mjs \
  --token src/assets/tokens/0xbca138ded469f5063589bfdfdd4bc68eb1c3f252.png \
  --token src/assets/tokens/0xfcbd14dc51f0a4d49d5e53c2e0950e0bc26d0dce.png \
  --out src/assets/vaults/0x181f3b1d55299f3744188f7ecd082c75a97d2d4f.png
```

- Repeat `--token` one to four times; PNG, SVG, JPG and WebP inputs are supported by Sharp.
- Optionally repeat `--token-background '#RRGGBB'` once per token, in the same order.
- `--background '#ffffff'` supplies the fallback color; `--fit cover|contain` defaults to `cover`.
- Legacy `--left` and `--right` are accepted together instead of `--token`; they now produce the diagonal design.
- Old border/divider/size flags are rejected. Output is always 1024x1024 opaque PNG.

## Verify and deliver

Inspect the output both square and circularly cropped at small UI sizes. Verify token order, logo alignment, colors, and absence of seams. Check dimensions, no transparent pixels, and size under 5 MB.

For metadata assets, use `src/assets/vaults/<lowercase-vault-address>.png`, not the pool/staking-token address. Set `logoURI` to `https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/vaults/<lowercase-vault-address>.png/public` before upload. Run focused Biome checks on changed JSON, `pnpm validate:json .`, and `pnpm validate:images .`; report network failures separately. New/changed production assets need `cloudflare-uploads` approval in CI.

Generate previews outside `src/assets` so tests do not become production metadata. When a forum request supplies the pair, verify its token and vault addresses separately.
