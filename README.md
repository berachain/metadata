# 🐻 Berachain Metadata

This repository contains the default lists for Berachain's interfaces, including:

- [tokens](https://github.com/berachain/metadata/blob/main/schemas/tokens.schema.json)
- [vaults](https://github.com/berachain/metadata/blob/main/schemas/vaults.schema.json)
- [validators](https://github.com/berachain/metadata/blob/main/schemas/validators.schema.json)

## Quick Start

```bash
# FROM: ./
pnpm install;
pnpm validate;
```

## Overview

- `src/tokens/`: Token lists for different networks
- `src/vaults/`: Vault lists for different networks - Please note this is only for Whitelisted Vaults that are passed through governance
- `src/validators/`: Validator lists for different networks
- `src/assets/`: Image assets for tokens, vaults, and validators

## Contributing

Please make sure to read [Code of Conduct](CODE_OF_CONDUCT.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for more instructions on how to contribute to the Berachain Metadata.

## Validating Lists

```bash
pnpm run validate
```
