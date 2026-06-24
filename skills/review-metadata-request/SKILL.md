---
name: review-metadata-request
description: Review Berachain metadata requests before editing JSON. Use when adding or updating token, vault, validator, protocol, or asset metadata from a governance, forum, or partner request.
---

# Review Metadata Request

## Workflow

1. Identify the metadata type and target network, then read the matching schema:
   - Tokens: `schemas/tokens.schema.json`
   - Vaults: `schemas/vaults.schema.json`
   - Validators: `schemas/validators.schema.json`
2. Verify request details from the provided source link.
   - For vaults, verify the reward vault address, staking token address, token pair, token addresses, protocol/pool URL, requested vault name, and any attached assets.
   - For tokens, verify the token address, chain ID, name, symbol, decimals, and any price or tag metadata.
   - For validators, verify the validator pubkey, name, website, social links, and logo source.
3. Match nearby entries for ordering, formatting, protocol names, categories, descriptions, and action style.
4. Do not add fee tiers, island types, owners, or optional metadata unless verified from the request, Hub, protocol docs, or another source of truth.
5. Handle assets.
   - Prefer official project assets over low-quality forum attachments.
   - Commit new images under `src/assets/**` and set the expected Cloudflare Images `logoURI`.
   - For split-token vault images, use the `generate-vault-pair-image` skill.
6. Validate only what changed.
   - Run `pnpm biome check <changed-json-files>` for JSON edits.
   - Run `pnpm validate:json .`.
   - Run `pnpm validate:images .` when assets or `logoURI` values changed.
   - Report local network, secret, or sandbox limits instead of changing code to satisfy the environment.
