# 🐻 Berachain Metadata

This repository contains the default lists for Berachain's interfaces, including:

- [tokens](#adding-a-token)
- [vaults](#adding-a-vault)
- [validators](#adding-a-validator)

## Quick Start

```bash
# FROM: ./
pnpm install;
pnpm validate;
```

## Overview

- [`src/tokens/`](/src/tokens): Token lists for different networks
- [`src/vaults/`](/src/vaults/): Vault lists for different networks - Please note this is only for Whitelisted Vaults that are passed through governance
- [`src/validators/`](/src//validators/): Validator lists for different networks
- [`src/assets/`](/src/assets/): Image assets for tokens, vaults, and validators

## Contributing

Please make sure to read [Code of Conduct](CODE_OF_CONDUCT.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for more instructions on how to contribute to the Berachain Metadata.

## Validating Lists

```bash
pnpm run validate
```
