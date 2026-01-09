/**
 * Validates missing metadata by checking against Berachain Hub API endpoints
 * This adds warnings (not errors) for missing metadata that should be added
 */

import {
  getApolloClient,
  getRewardVaults,
  gql,
} from "@berachain/berajs/actions";
import { isToken } from "@berachain/berajs/utils";

async function fetchMissingIncentives() {
  try {
    const apiClient = getApolloClient("api", {});

    const result = await apiClient.query<{
      vaults: {
        vaults: {
          whitelistedIncentives: {
            token: {
              name: string;
              address: string;
              logoURI: string | null;
              symbol: string;
            };
          }[];
        }[];
      };
    }>({
      query: gql`query GetIncentives {
      vaults: polGetRewardVaults(chain:BERACHAIN, first:1000) {
        vaults {
          whitelistedIncentives {
            token {
              name
              logoURI
              address
              symbol
            }
          }
        }
      }
    }`,
    });

    const incentives = result.data.vaults.vaults.flatMap(
      (v) => v.whitelistedIncentives,
    );
    const uniqueIncentives = incentives.filter(
      (incentive, index, self) =>
        index ===
        self.findIndex((t) =>
          isToken(t.token, incentive.token.address as `0x${string}`),
        ),
    );

    return uniqueIncentives
      .filter((incentive) => !incentive.token.logoURI)
      .map((incentive) => incentive.token);
  } catch (error) {
    // Network errors should not fail validation, just warn
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "Warning",
      `Failed to fetch missing metadata from Berachain Hub API: ${error instanceof Error ? error.message : "Unknown error"}. Skipping API metadata validation.`,
    );
    return [];
  }
}

async function fetchMissingVaults() {
  try {
    const vaults = await getRewardVaults({
      filter: {
        pageSize: 1000,
      },
    });

    return vaults.gaugeList.filter((vault) => !vault.metadata);
  } catch (error) {
    // Network errors should not fail validation, just warn
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "Warning",
      `Failed to fetch missing metadata from Berachain Hub API: ${error instanceof Error ? error.message : "Unknown error"}. Skipping API metadata validation.`,
    );
    return [];
  }
}

export async function validateApiMetadata(warnings: string[]): Promise<void> {
  // Fetch missing metadata from both endpoints
  const [missingIncentives, missingVaults] = await Promise.all([
    fetchMissingIncentives(),
    fetchMissingVaults(),
  ]);

  // Process missing incentives
  for (const item of missingIncentives) {
    if (item.address) {
      warnings.push(
        `Missing metadata for incentive/staking token: ${item.address} (${item.name || item.symbol}). Consider adding metadata for this address.`,
      );
    }
  }

  // Process missing vaults
  for (const item of missingVaults) {
    if (item.vaultAddress) {
      const stakingTokenInfo = item.stakingToken
        ? `staking token: ${item.stakingToken.symbol}`
        : "";
      warnings.push(
        `Missing metadata for vault: ${item.vaultAddress}${stakingTokenInfo ? ` (${stakingTokenInfo})` : ""}. Consider adding vault metadata.`,
      );
    }
  }
}
