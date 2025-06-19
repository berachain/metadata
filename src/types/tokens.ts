// Strict types for Berachain tokens mainnet JSON

export interface TokensFile {
  $schema: string;
  name: string;
  logoURI: string;
  tags: Record<string, TokenTag>;
  tokens: Token[];
}

export interface TokenTag {
  name: string;
  description: string;
}

export interface Token {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  base64?: string;
  tags?: string[];
  extensions?: Record<string, string>;
}
