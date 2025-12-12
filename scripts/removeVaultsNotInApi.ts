/**
 * Script to remove vaults from mainnet.json that are not returned by the Berachain GraphQL API
 * Preserves the order of remaining vaults
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface GraphQLResponse {
  data: {
    polGetRewardVaults: {
      pagination: {
        currentPage: number;
        totalCount: number;
      };
      vaults: Vault[];
    };
  };
}

interface Vault {
  id: string;
  vaultAddress: string;
  address: string;
  isVaultWhitelisted: boolean;
}

const GRAPHQL_QUERY = `query GetVaults($where: GqlRewardVaultFilter, $pageSize: Int, $skip: Int) {
  polGetRewardVaults(
    where: $where
    first: $pageSize
    skip: $skip
  ) {
    pagination {
      currentPage
      totalCount
      __typename
    }
    vaults {
      vaultAddress
      isVaultWhitelisted
      __typename
    }
    __typename
  }
}`;

async function queryVaults(
  apiUrl: string,
  skip: number,
  pageSize: number,
  includeNonWhitelisted: boolean,
  retries = 3,
): Promise<GraphQLResponse> {
  const payload = {
    operationName: "GetVaults",
    variables: {
      skip,
      pageSize,
      where: {
        includeNonWhitelisted: includeNonWhitelisted,
        protocolsIn: null,
      },
    },
    extensions: {
      clientLibrary: {
        name: "@apollo/client",
        version: "4.0.7",
      },
    },
    query: GRAPHQL_QUERY,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(
          `Rate limited. Waiting ${delay}ms before retry ${attempt + 1}/${retries}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}\n${errorText}`,
        );
      }

      const data: GraphQLResponse = await response.json();

      if (data.data?.polGetRewardVaults) {
        return data;
      }

      throw new Error("Invalid response structure");
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(
        `Error occurred. Waiting ${delay}ms before retry ${attempt + 1}/${retries}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Failed after all retries");
}

async function fetchAllVaultsFromApi(
  apiUrl: string,
  includeNonWhitelisted: boolean,
): Promise<Set<string>> {
  const pageSize = 100;
  let skip = 0;
  let totalFetched = 0;
  let totalCount = 0;
  const apiVaultAddresses = new Set<string>();

  console.log(
    `Fetching all vaults from API (includeNonWhitelisted: ${includeNonWhitelisted})...\n`,
  );

  // First query to get total count
  const firstResponse = await queryVaults(
    apiUrl,
    0,
    pageSize,
    includeNonWhitelisted,
  );
  totalCount = firstResponse.data.polGetRewardVaults.pagination.totalCount;
  console.log(`Total vaults in API: ${totalCount}\n`);

  // Process first batch
  const firstBatch = firstResponse.data.polGetRewardVaults.vaults;
  totalFetched += firstBatch.length;

  for (const vault of firstBatch) {
    apiVaultAddresses.add(vault.vaultAddress.toLowerCase());
  }

  console.log(`Fetched ${totalFetched}/${totalCount} vaults...`);

  // Continue pagination
  skip = pageSize;
  while (skip < totalCount) {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await queryVaults(
      apiUrl,
      skip,
      pageSize,
      includeNonWhitelisted,
    );
    const batch = response.data.polGetRewardVaults.vaults;
    totalFetched += batch.length;

    for (const vault of batch) {
      apiVaultAddresses.add(vault.vaultAddress.toLowerCase());
    }

    console.log(`Fetched ${totalFetched}/${totalCount} vaults...`);

    if (batch.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  console.log(
    `\n✅ Fetched ${apiVaultAddresses.size} unique vault addresses from API\n`,
  );

  return apiVaultAddresses;
}

async function main() {
  const apiUrl = "https://api.berachain.com/";

  try {
    // Read vaults from mainnet.json
    const vaultsPath = join(process.cwd(), "src", "vaults", "mainnet.json");
    const content = JSON.parse(readFileSync(vaultsPath, "utf-8"));
    const localVaults = content.vaults as Array<{ vaultAddress: string }>;

    console.log(`Found ${localVaults.length} vaults in mainnet.json\n`);
    console.log("=".repeat(80));

    // Fetch all vaults from API (both whitelisted and non-whitelisted)
    const apiVaultAddresses = await fetchAllVaultsFromApi(apiUrl, true);

    // Filter out vaults that are not in API, preserving order
    const originalCount = localVaults.length;
    const filteredVaults = localVaults.filter((vault) => {
      const vaultAddress = vault.vaultAddress.toLowerCase();
      return apiVaultAddresses.has(vaultAddress);
    });

    const removedCount = originalCount - filteredVaults.length;

    // Display results
    console.log("=".repeat(80));
    if (removedCount === 0) {
      console.log(
        "\n✅ All vaults in mainnet.json are present in the API response. No removals needed.",
      );
    } else {
      console.log(
        `\n⚠️  Removing ${removedCount} vault(s) that are NOT in the API response:\n`,
      );
      console.log("=".repeat(80));

      // Show which vaults will be removed
      const removedVaults = localVaults.filter((vault) => {
        const vaultAddress = vault.vaultAddress.toLowerCase();
        return !apiVaultAddresses.has(vaultAddress);
      });

      for (const vault of removedVaults) {
        const vaultData = vault as any;
        console.log(`\nRemoving: ${vault.vaultAddress}`);
        console.log(`  Name: ${vaultData.name || "N/A"}`);
        console.log(`  Protocol: ${vaultData.protocol || "N/A"}`);
      }

      console.log("\n" + "=".repeat(80));

      // Update the content
      content.vaults = filteredVaults;

      // Write back to file
      writeFileSync(vaultsPath, JSON.stringify(content, null, 2) + "\n");

      console.log(`\n✅ Removed ${removedCount} vault(s) from mainnet.json`);
      console.log(
        `   Remaining vaults: ${filteredVaults.length} (preserved original order)\n`,
      );
    }
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
