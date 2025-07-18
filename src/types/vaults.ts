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
  subcategories?: Omit<Category, "subcategories">[];
}

export interface Protocol {
  name: string;
  logoURI: string;
  url: string;
  description: string;
  tags?: string[];
}

export interface Vault {
  stakingTokenAddress: string;
  vaultAddress: string;
  name: string;
  protocol: string;
  logoURI?: string;
  url: string;
  description?: string;
  categories?: string[];
}
