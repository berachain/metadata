# AGENTS.md

Guidance for AI agents working in this repository.

## Repository Purpose

This repository contains Berachain metadata used by Berachain interfaces:

- Token lists in `src/tokens/`
- Reward vault lists in `src/vaults/`
- Validator lists in `src/validators/`
- Image assets in `src/assets/`

Keep changes scoped to the metadata item being added or fixed. Do not refactor unrelated entries, reformat whole files, or change dependency/workflow files unless the task explicitly requires it.

## Before Editing

1. Run `git status -sb` and preserve unrelated local changes.
2. Pull latest `main` before starting a new metadata PR.
3. Verify source-of-truth details from the relevant governance/forum/request link before editing JSON:
   - Token name, symbol, decimals, and address
   - Reward vault address
   - Staking token address
   - Protocol/location URL
   - Vault name, preferably matching the request unless repo convention clearly requires otherwise

For reward vault requests, use the forum/request page as the primary source when available. Check the request sections that identify:

- Reward vault address
- Staking token address
- Token pair and token addresses
- Protocol/pool URL
- Requested vault name
- Any attached protocol, token, or vault images

If a forum image is low quality, prefer official project brand assets for token images. For generated vault pair images, compose from official token assets and keep the result compliant with the asset rules below.

## Image Assets

Assets are committed to `src/assets/**` and uploaded by CI to Cloudflare Images. Do not use Cloudinary for new metadata.

Current URL format:

```text
https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/<type>/<filename>/public
```

Where `<type>` is one of:

- `tokens`
- `vaults`
- `validators`
- `protocols`

Asset requirements:

- PNG, JPG, or JPEG only
- 1024x1024 pixels
- Under 5 MB
- PNG files must have no transparent pixels
- Use a solid background when converting SVG or transparent source art

Filename conventions:

- Token image: `src/assets/tokens/<token-address>.png`
- Vault image: `src/assets/vaults/<vault-address>.png`
- Validator image: `src/assets/validators/<validator-pubkey>.png`

For token and vault images, use the exact address casing accepted by `scripts/utils/_imageChecks.ts`. Existing metadata commonly uses lowercase Cloudflare URLs, but the upload script validates non-default asset filenames before upload.

Do not name a vault image after the staking token address. Current vault asset convention is `src/assets/vaults/<vault-address>.<ext>`, and the `logoURI` should use the same vault-address filename.

## Cloudflare Upload Flow

New or changed files under `src/assets/**` trigger the `upload-assets` CI job.

The upload job:

1. Waits for maintainer approval of the `cloudflare-uploads` GitHub Actions environment.
2. Uploads changed images to Cloudflare Images with IDs like `tokens/<filename>` or `vaults/<filename>`.
3. Allows the `images` validation check to run against the uploaded URLs.

Agents should commit the image files and set the expected Cloudflare `logoURI` in JSON before the URL exists. Do not attempt to upload manually unless explicitly asked and credentials are available.

Some older docs or examples may still mention Cloudinary. Treat those as stale for new metadata unless the repo workflow has changed again.

## Adding Token Metadata

Edit `src/tokens/mainnet.json` or the relevant network file.

Required fields:

- `chainId`
- `address`
- `symbol`
- `name`
- `decimals`

Usually include:

- `logoURI`
- `tags` when appropriate, for example `["stablecoin"]`
- `extensions.coingeckoId`, `extensions.pythPriceId`, or `extensions.beraPythPriceId` only when verified

## Adding Vault Metadata

Edit `src/vaults/mainnet.json` or the relevant network file.

Required fields:

- `stakingTokenAddress`
- `vaultAddress`
- `name`
- `protocol`
- `url`
- `categories`

Usually include:

- `logoURI`
- `description`
- `action`
- `owner` when it is already part of the local convention for that protocol/project

Vaults should only be added when they are whitelisted/passed through the relevant governance or forum process. Link the source in the PR body.

Use the forum/request vault name unless there is a clear, verified reason to adapt it to an existing naming convention. Do not add details such as fee tier, island type, or owner unless they are verified from the request, Hub, Kodiak, or another source of truth.

For Kodiak vaults, common fields are:

- `protocol`: `Kodiak`
- `categories`: `["defi/amm"]`
- `url`: Kodiak pool URL, including `farm=<vaultAddress>` when available
- `description`: `Acquired by depositing liquidity into the <PAIR> Pool on Kodiak`
- `action`: `Stake <TOKEN A> / <TOKEN B>`

## Validation

Run focused checks after editing:

```bash
pnpm biome check <changed-json-files>
pnpm validate:json .
pnpm validate:images .
```

`pnpm validate` also runs data, Pyth, and CoinGecko checks. Those may require network access or CI secrets, so local failures can be environmental. Record exactly what was run and any environmental limitation in the PR body.

If `tsx` fails locally with an IPC permission error under the system temp directory, rerun the same validator with appropriate sandbox approval instead of changing code.

## PR Expectations

PRs should include:

- A concise summary of metadata/assets added
- The governance/forum/source link used for verification
- The key addresses verified from that source
- Validation commands run
- Note that new assets require `cloudflare-uploads` approval if `src/assets/**` changed

Stage only the intended files. For asset PRs, this is usually:

- The relevant JSON metadata file(s)
- The corresponding file(s) under `src/assets/**`
