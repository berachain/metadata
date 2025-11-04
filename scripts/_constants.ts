import type { Address } from "viem";

export const VALID_CHAIN_NAMES = ["mainnet", "bepolia"] as const;

export type ValidChainName = (typeof VALID_CHAIN_NAMES)[number];

export const REWARD_VAULT_FACTORIES: Record<ValidChainName, Address> = {
  mainnet: "0x94Ad6Ac84f6C6FbA8b8CCbD71d9f4f101def52a8",
  bepolia: "0x94Ad6Ac84f6C6FbA8b8CCbD71d9f4f101def52a8",
} as const;

export const CASE_SENSITIVE_ADDRESSES = false;

// Kodiak Island (Uniswap V3 fork) LP Token ABI
// Used to extract underlying token addresses from LP tokens
export const KODIAK_ISLAND_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "contract IERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "contract IERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Protocol Brand Colors Configuration
// Maps protocol/owner names to their brand colors (hex format)
// Uses vault metadata's "owner" field (fallback to "protocol" field)
export const PROTOCOL_BRAND_COLORS: Record<string, string> = {
  Kodiak: "#A1623D",
};

/**
 * Gets the brand color for a protocol (case-insensitive)
 * @param protocolName - The name of the protocol
 * @returns The hex color string, or undefined if not found
 */
export function getProtocolBrandColor(
  protocolName: string,
): string | undefined {
  // Case-insensitive lookup
  const normalizedName = protocolName.trim();

  // Try exact match first
  if (PROTOCOL_BRAND_COLORS[normalizedName]) {
    return PROTOCOL_BRAND_COLORS[normalizedName];
  }

  // Try case-insensitive match
  const key = Object.keys(PROTOCOL_BRAND_COLORS).find(
    (k) => k.toLowerCase() === normalizedName.toLowerCase(),
  );

  return key ? PROTOCOL_BRAND_COLORS[key] : undefined;
}
