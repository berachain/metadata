/**
 * Validates missing metadata by checking against Berachain Hub API endpoints
 * This adds warnings (not errors) for missing metadata that should be added
 */

interface MissingMetadataItem {
  address?: string;
  vaultAddress?: string;
  stakingTokenAddress?: string;
  [key: string]: unknown;
}

interface ApiResponse {
  data?: MissingMetadataItem[];
  items?: MissingMetadataItem[];
  [key: string]: unknown;
}

async function fetchMissingMetadata(
  endpoint: string,
  bearerToken: string,
): Promise<MissingMetadataItem[]> {
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // If API is unavailable or returns error, skip validation (don't fail)
      if (response.status === 401 || response.status === 403) {
        console.warn(
          "\x1b[33m%s\x1b[0m",
          "Warning",
          `API authentication failed for ${endpoint}. Skipping API metadata validation.`,
        );
      } else {
        console.warn(
          "\x1b[33m%s\x1b[0m",
          "Warning",
          `API request failed for ${endpoint} (${response.status}). Skipping API metadata validation.`,
        );
      }
      return [];
    }

    const data: ApiResponse = await response.json();

    // Handle different possible response structures
    if (Array.isArray(data)) {
      return data;
    }
    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    if (data.items && Array.isArray(data.items)) {
      return data.items;
    }

    return [];
  } catch (error) {
    // Network errors should not fail validation, just warn
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "Warning",
      `Failed to fetch missing metadata from ${endpoint}: ${error instanceof Error ? error.message : "Unknown error"}. Skipping API metadata validation.`,
    );
    return [];
  }
}

export async function validateApiMetadata(warnings: string[]): Promise<void> {
  const bearerToken = process.env.BERACHAIN_HUB_API_TOKEN;
  const apiBaseUrl = process.env.BERACHAIN_HUB_API_BASE_URL;

  if (!bearerToken) {
    // Token not provided, skip validation (don't fail)
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "Warning",
      "BERACHAIN_HUB_API_TOKEN environment variable not set. Skipping API metadata validation.",
    );
    return;
  }

  if (!apiBaseUrl) {
    // API base URL not provided, skip validation (don't fail)
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "Warning",
      "BERACHAIN_HUB_API_BASE_URL environment variable not set. Skipping API metadata validation.",
    );
    return;
  }

  const incentivesEndpoint = `${apiBaseUrl}/incentives/no-metadata/`;
  const vaultsEndpoint = `${apiBaseUrl}/vaults/no-metadata/`;

  // Fetch missing metadata from both endpoints
  const [missingIncentives, missingVaults] = await Promise.all([
    fetchMissingMetadata(incentivesEndpoint, bearerToken),
    fetchMissingMetadata(vaultsEndpoint, bearerToken),
  ]);

  // Process missing incentives
  for (const item of missingIncentives) {
    const address = item.address || item.stakingTokenAddress;
    if (address) {
      warnings.push(
        `Missing metadata for incentive/staking token: ${address}. Consider adding metadata for this address.`,
      );
    }
  }

  // Process missing vaults
  for (const item of missingVaults) {
    const vaultAddress = item.vaultAddress;
    const stakingTokenAddress = item.stakingTokenAddress;
    if (vaultAddress && stakingTokenAddress) {
      warnings.push(
        `Missing metadata for vault: ${vaultAddress} (staking token: ${stakingTokenAddress}). Consider adding vault metadata.`,
      );
    } else if (vaultAddress) {
      warnings.push(
        `Missing metadata for vault: ${vaultAddress}. Consider adding vault metadata.`,
      );
    } else if (stakingTokenAddress) {
      warnings.push(
        `Missing metadata for staking token: ${stakingTokenAddress}. Consider adding vault metadata.`,
      );
    }
  }
}
