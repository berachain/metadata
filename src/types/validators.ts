// Strict types for Berachain validators mainnet JSON

export interface ValidatorsFile {
  $schema: string;
  name: string;
  validators: Validator[];
}

export interface Validator {
  id: string;
  logoURI?: string;
  name: string;
  description?: string;
  website?: string;
  twitter?: string;
}
