/**
 * Validates missing metadata by checking against Berachain Hub API endpoints
 * This adds warnings (not errors) for missing metadata that should be added
 */

interface MissingIncentiveItem {
  address: string;
  name: string;
  logoURI: string | null;
  symbol: string;
}

interface MissingVaultItem {
  vaultAddress: string;
  isVaultWhitelisted: boolean;
  apr: number | null;
  tvl: number | null;
  url: string;
  stakingToken: string;
}

type ApiResponse =
  | MissingIncentiveItem[]
  | MissingVaultItem[]
  | {
      data?: MissingIncentiveItem[] | MissingVaultItem[];
      items?: MissingIncentiveItem[] | MissingVaultItem[];
      [key: string]: unknown;
    };

async function fetchMissingIncentives(
  endpoint: string,
  bearerToken: string,
): Promise<MissingIncentiveItem[]> {
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
      return data as MissingIncentiveItem[];
    }
    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      Array.isArray(data.data)
    ) {
      return data.data as MissingIncentiveItem[];
    }
    if (
      data &&
      typeof data === "object" &&
      "items" in data &&
      Array.isArray(data.items)
    ) {
      return data.items as MissingIncentiveItem[];
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

async function fetchMissingVaults(
  endpoint: string,
  bearerToken: string,
): Promise<MissingVaultItem[]> {
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
      return data as MissingVaultItem[];
    }
    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      Array.isArray(data.data)
    ) {
      return data.data as MissingVaultItem[];
    }
    if (
      data &&
      typeof data === "object" &&
      "items" in data &&
      Array.isArray(data.items)
    ) {
      return data.items as MissingVaultItem[];
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
    fetchMissingIncentives(incentivesEndpoint, bearerToken),
    fetchMissingVaults(vaultsEndpoint, bearerToken),
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
        ? `staking token: ${item.stakingToken}`
        : "";
      warnings.push(
        `Missing metadata for vault: ${item.vaultAddress}${stakingTokenInfo ? ` (${stakingTokenInfo})` : ""}. Consider adding vault metadata.`,
      );
    }
  }
}
