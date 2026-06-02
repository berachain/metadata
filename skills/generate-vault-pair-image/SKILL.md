---
name: generate-vault-pair-image
description: Generate repo-ready split-token vault, pool, or LP images from two underlying token logos. Use when a user needs a 1024x1024 paired-token vault image, half-and-half token icon, LP pair logo, Berachain metadata vault asset, Cloudflare-ready token pair image, or asks to recreate a blurry forum vault image from cleaner underlying token assets.
---

# Generate Vault Pair Image

## Workflow

1. Identify the two underlying token images.
   - Prefer official brand-kit assets or existing repository token assets.
   - If the source is SVG or transparent PNG, render/flatten it onto a solid background.
   - Do not upscale a blurry forum image when cleaner token assets exist.
2. Decide output path and naming.
   - For Berachain metadata vaults, use `src/assets/vaults/<vault-address>.png`.
   - Do not name vault images after the staking token/pool address.
3. Generate a 1024x1024 image.
   - Left token fills the left half.
   - Right token fills the right half.
   - Apply an outer circle border and center divider.
   - Flatten onto a solid background so PNG transparency checks pass.
4. Validate:
   - Dimensions must be `1024x1024`.
   - PNG must have no transparent pixels.
   - File should be under 5 MB.

## Script

Use `scripts/generate_pair_image.mjs` for deterministic generation. It uses this repo's `sharp` dependency, so run it from the repository root.

Example:

```bash
node skills/generate-vault-pair-image/scripts/generate_pair_image.mjs \
  --left src/assets/tokens/0xbca138DEd469F5063589bFdfdD4BC68EB1c3f252.png \
  --right src/assets/tokens/0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce.png \
  --out src/assets/vaults/0x181f3b1d55299f3744188f7ecd082c75a97d2d4f.png \
  --border '#ffffff' \
  --background '#ffffff'
```

Common options:

- `--left`: left token image, including SVG/PNG/JPG/WebP supported by `sharp`
- `--right`: right token image
- `--out`: output PNG path
- `--border`: outer circle and center divider color, default `#ffffff`
- `--background`: flattened background color, default `#ffffff`
- `--border-width`: outer border width, default `52`
- `--divider-width`: center divider width, default `46`
- `--fit`: token resize mode, default `cover`; use `contain` for logos that should not crop

## Berachain Metadata Notes

For metadata PRs:

- Set `logoURI` to the expected Cloudflare Images URL before CI uploads it.
- Use `https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/vaults/<vault-address>.png/public`.
- Commit the generated image under `src/assets/vaults/`.
- `pnpm validate:images .` should pass after the JSON entry references the image.

If the pair image is based on a forum/request asset, verify the request name and addresses from the forum, but generate the image from official token assets when the attached image is low quality.
