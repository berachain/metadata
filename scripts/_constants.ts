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

// Brand Color Types
export type BrandColor =
  | string // Simple hex color like "#3083DC"
  | {
      type: "linear";
      angle: number; // Angle in degrees (0 = left to right, 90 = bottom to top)
      stops: Array<{ offset: string; color: string }>; // e.g., [{offset: "0%", color: "#ff0000"}, {offset: "100%", color: "#0000ff"}]
    };

// Protocol Brand Colors Configuration
// Maps protocol/owner names to their brand colors (hex format or gradient)
// Uses vault metadata's "owner" field
export const PROTOCOL_BRAND_COLORS: Record<string, BrandColor> = {
  Kodiak: "#3083DC",
  OpenState: "#24E4EE",
  "Infrared Finance": {
    type: "linear",
    angle: 90,
    stops: [
      { offset: "0%", color: "#B93483" },
      { offset: "50%", color: "#E85A46" },
      { offset: "100%", color: "#F4A435" },
    ],
  },
  "Bullas Exchange": "#599952",
  BrownFi: "#773030",
  BakderDAO:"#CE7E02"
};

/**
 * Gets the brand color for a protocol (case-insensitive)
 * @param protocolName - The name of the protocol
 * @returns The brand color (hex string or gradient object), or undefined if not found
 */
export function getProtocolBrandColor(
  protocolName: string,
): BrandColor | undefined {
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
