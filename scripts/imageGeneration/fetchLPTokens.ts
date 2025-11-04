import type { Address, PublicClient } from "viem";
import { KODIAK_ISLAND_ABI } from "../_constants";

export interface LPTokenInfo {
  stakingTokenAddress: Address;
  underlyingTokens: Address[];
  isLPToken: boolean;
}

/**
 * Fetches underlying token addresses from a Kodiak Island LP token
 * @param stakingTokenAddress - The LP token address to query
 * @param client - The viem public client for on-chain calls
 * @returns LPTokenInfo with underlying token addresses, or single token if not an LP
 */
export async function fetchLPTokens(
  stakingTokenAddress: Address,
  client: PublicClient,
): Promise<LPTokenInfo> {
  try {
    // Try to read token0 and token1 from the LP contract
    const [token0, token1] = await Promise.all([
      client.readContract({
        address: stakingTokenAddress,
        abi: KODIAK_ISLAND_ABI,
        functionName: "token0",
      }),
      client.readContract({
        address: stakingTokenAddress,
        abi: KODIAK_ISLAND_ABI,
        functionName: "token1",
      }),
    ]);

    return {
      stakingTokenAddress,
      underlyingTokens: [token0, token1],
      isLPToken: true,
    };
  } catch (error) {
    // If token0/token1 calls fail, it's likely a single token (not an LP)
    console.warn(
      `Could not fetch LP tokens for ${stakingTokenAddress}, treating as single token`,
    );
    return {
      stakingTokenAddress,
      underlyingTokens: [stakingTokenAddress],
      isLPToken: false,
    };
  }
}

/**
 * Attempts to detect if a staking token is an LP token with 3+ underlying tokens
 * This is a future extension point for multi-asset pools
 */
export async function detectMultiTokenLP(
  stakingTokenAddress: Address,
  client: PublicClient,
): Promise<Address[]> {
  // For now, Kodiak Islands only support 2-token pools
  // This function is a placeholder for future expansion
  const lpInfo = await fetchLPTokens(stakingTokenAddress, client);
  return lpInfo.underlyingTokens;
}
