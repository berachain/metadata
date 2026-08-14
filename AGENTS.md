# Repository Guidance

## Scope

This repository contains Berachain metadata used by Berachain interfaces:

- Token lists in `src/tokens/`
- Reward vault lists in `src/vaults/`
- Validator lists in `src/validators/`
- Image assets in `src/assets/`

Keep changes scoped to the metadata item being added or fixed. Do not refactor unrelated entries, reformat whole files, or change dependency/workflow files unless explicitly asked.

Use `skills/review-metadata-request/SKILL.md` for request verification workflows. Use `skills/generate-vault-pair-image/SKILL.md` when generating split-token vault images.

## Schemas

JSON schemas are the source of truth for required fields, URL patterns, and property constraints:

- Tokens: `schemas/tokens.schema.json`
- Vaults: `schemas/vaults.schema.json`
- Validators: `schemas/validators.schema.json`

Keep `$schema` pointers aligned with existing files in the same directory.

## Image Assets

Assets are committed to `src/assets/**` and uploaded by CI to Cloudflare Images. Do not use Cloudinary for new metadata.

Set `logoURI` before CI uploads the asset:

```text
https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/<type>/<filename>/public
```

Use existing asset conventions: tokens by token address, vaults by vault address, validators by validator pubkey, and protocols by protocol slug. Filenames must be lowercase — Cloudflare image ids are case-sensitive, so the `<filename>` in `logoURI` must match the lowercase asset filename, not the checksummed address. New or changed assets require `cloudflare-uploads` approval in CI.

## Validation

Run focused checks:

```bash
pnpm biome check <changed-json-files>
pnpm validate:json .
pnpm validate:images .
```

Full `pnpm validate` may require network access or CI secrets. Report environmental failures instead of changing code to satisfy a local sandbox.
