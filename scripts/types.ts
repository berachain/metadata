export interface Protocol {
  name?: string;
  url?: string;
}

export interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  [key: string]: unknown;
}

export interface Vault {
  vaultAddress: string;
  stakingTokenAddress: string;
  name: string;
  protocol: string;
  logoURI: string;
  url: string;
  description: string;
  owner: string;
  [key: string]: unknown;
}

export interface Validator {
  address?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}
