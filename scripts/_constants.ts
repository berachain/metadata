import type { Address } from "viem";

export const VALID_CHAIN_NAMES = ["mainnet", "bepolia"] as const;

export type ValidChainName = (typeof VALID_CHAIN_NAMES)[number];

export const REWARD_VAULT_FACTORIES: Record<ValidChainName, Address> = {
  mainnet: "0x94Ad6Ac84f6C6FbA8b8CCbD71d9f4f101def52a8",
  bepolia: "0x94Ad6Ac84f6C6FbA8b8CCbD71d9f4f101def52a8",
} as const;

export const CASE_SENSITIVE_ADDRESSES = true;
