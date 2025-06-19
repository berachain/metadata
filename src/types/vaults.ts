// Strict types for Berachain vaults mainnet JSON

export interface VaultsFile {
  $schema: string;
  name: string;
  protocols: Protocol[];
  vaults: Vault[];
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
}
