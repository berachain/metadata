/**
 * Script to identify vaults in mainnet.json that are not returned by the Berachain GraphQL API
 * This helps identify vaults that exist in metadata but are not active/whitelisted in the API
 */

import { readFileSync } from "fs";
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

    // Find vaults in mainnet.json that are not in API
    const vaultsNotInApi: Array<{
      vaultAddress: string;
      name?: string;
      protocol?: string;
    }> = [];

    for (const vault of localVaults) {
      const vaultAddress = vault.vaultAddress.toLowerCase();
      if (!apiVaultAddresses.has(vaultAddress)) {
        vaultsNotInApi.push({
          vaultAddress: vault.vaultAddress,
          name: (vault as any).name,
          protocol: (vault as any).protocol,
        });
      }
    }

    // Display results
    console.log("=".repeat(80));
    if (vaultsNotInApi.length === 0) {
      console.log(
        "\n✅ All vaults in mainnet.json are present in the API response",
      );
    } else {
      console.log(
        `\n⚠️  Found ${vaultsNotInApi.length} vault(s) in mainnet.json that are NOT returned by the API:\n`,
      );
      console.log("=".repeat(80));
      for (const vault of vaultsNotInApi) {
        console.log(`\nVault Address: ${vault.vaultAddress}`);
        console.log(`  Name: ${vault.name || "N/A"}`);
        console.log(`  Protocol: ${vault.protocol || "N/A"}`);
      }
      console.log("\n" + "=".repeat(80));
      console.log(
        "\n💡 These vaults exist in the metadata file but are not active/whitelisted in the API.",
      );
      console.log(
        "   They will not appear in the UI until they are returned by the API.\n",
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
