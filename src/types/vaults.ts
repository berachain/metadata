// Strict types for Berachain vaults mainnet JSON

export interface VaultsFile {
  $schema: string;
  name: string;
  protocols: Protocol[];
  categories: Category[];
  vaults: Vault[];
}

export interface Category {
  slug: string;
  description?: string;
}

export interface Protocol {
  name: string;
  logoURI: string;
  url: string;
  description: string;
}

export interface Vault {
  stakingTokenAddress: string;
  vaultAddress: string;
  name: string;
  protocol: string;
  logoURI?: string;
  url: string;
  description?: string;
  category?: string[];
}
