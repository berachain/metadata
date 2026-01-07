/**
 * Unified script to manage vaults based on Berachain GraphQL API
 * Supports: finding missing vaults, adding vaults from API, and removing vaults not in API
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import "dotenv/config";

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
  dynamicData: {
    allTimeReceivedBGTAmount: string;
    apr: number | null;
    bgtCapturePercentage: number;
    bgtCapturePerBlock: string;
    activeIncentivesValueUsd: number;
    activeIncentivesRateUsd: number;
    tvl: number | null;
  };
  stakingTokenAmount: string;
  stakingToken: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  metadata: {
    name: string | null;
    logoURI: string | null;
    url: string | null;
    protocolName: string | null;
    protocolIcon: string | null;
    description: string | null;
    categories: string[] | null;
    action: string | null;
  } | null;
  activeIncentives: Array<{
    active: boolean;
    remainingAmount: string;
    remainingAmountUsd: number;
    incentiveRate: string;
    incentiveRateUsd: number;
    tokenAddress: string;
    token: {
      address: string;
      name: string;
      symbol: string;
      decimals: number;
    };
  }>;
}

const GRAPHQL_QUERY_FULL = `query GetVaults($where: GqlRewardVaultFilter, $pageSize: Int, $skip: Int, $orderBy: GqlRewardVaultOrderBy = bgtCapturePercentage, $orderDirection: GqlRewardVaultOrderDirection = desc, $search: String) {
  polGetRewardVaults(
    where: $where
    first: $pageSize
    skip: $skip
    orderBy: $orderBy
    orderDirection: $orderDirection
    search: $search
  ) {
    pagination {
      currentPage
      totalCount
      __typename
    }
    vaults {
      ...ApiVault
      __typename
    }
    __typename
  }
}

fragment ApiVault on GqlRewardVault {
  id: vaultAddress
  vaultAddress
  address: vaultAddress
  isVaultWhitelisted
  dynamicData {
    allTimeReceivedBGTAmount
    apr
    bgtCapturePercentage
    bgtCapturePerBlock
    activeIncentivesValueUsd
    activeIncentivesRateUsd
    bgtCapturePerBlock
    tvl
    __typename
  }
  stakingTokenAmount
  stakingToken {
    address
    name
    symbol
    decimals
    __typename
  }
  metadata {
    name
    logoURI
    url
    protocolName
    protocolIcon
    description
    categories
    action
    __typename
  }
  activeIncentives {
    ...ApiVaultIncentive
    __typename
  }
  __typename
}

fragment ApiVaultIncentive on GqlRewardVaultIncentive {
  active
  remainingAmount
  remainingAmountUsd
  incentiveRate
  incentiveRateUsd
  tokenAddress
  token {
    address
    name
    symbol
    decimals
    __typename
  }
  __typename
}`;

const GRAPHQL_QUERY_SIMPLE = `query GetVaults($where: GqlRewardVaultFilter, $pageSize: Int, $skip: Int) {
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
  fullData: boolean,
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
      ...(fullData && {
        orderBy: "bgtCapturePercentage",
        orderDirection: "desc",
      }),
    },
    extensions: {
      clientLibrary: {
        name: "@apollo/client",
        version: "4.0.7",
      },
    },
    query: fullData ? GRAPHQL_QUERY_FULL : GRAPHQL_QUERY_SIMPLE,
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
  fullData: boolean,
): Promise<{ addresses: Set<string>; vaults?: Vault[] }> {
  const pageSize = 100;
  let skip = 0;
  let totalFetched = 0;
  let totalCount = 0;
  const apiVaultAddresses = new Set<string>();
  const allVaults: Vault[] = [];

  console.log(
    `Fetching all vaults from API (includeNonWhitelisted: ${includeNonWhitelisted})...\n`,
  );

  // First query to get total count
  const firstResponse = await queryVaults(
    apiUrl,
    0,
    pageSize,
    includeNonWhitelisted,
    fullData,
  );
  totalCount = firstResponse.data.polGetRewardVaults.pagination.totalCount;
  console.log(`Total vaults in API: ${totalCount}\n`);

  // Process first batch
  const firstBatch = firstResponse.data.polGetRewardVaults.vaults;
  totalFetched += firstBatch.length;

  for (const vault of firstBatch) {
    apiVaultAddresses.add(vault.vaultAddress.toLowerCase());
    if (fullData) {
      allVaults.push(vault);
    }
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
      fullData,
    );
    const batch = response.data.polGetRewardVaults.vaults;
    totalFetched += batch.length;

    for (const vault of batch) {
      apiVaultAddresses.add(vault.vaultAddress.toLowerCase());
      if (fullData) {
        allVaults.push(vault);
      }
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

  return {
    addresses: apiVaultAddresses,
    vaults: fullData ? allVaults : undefined,
  };
}

function hasNoMetadata(vault: Vault): boolean {
  if (!vault.metadata) {
    return true;
  }

  const metadata = vault.metadata;
  return (
    !metadata.name &&
    !metadata.logoURI &&
    !metadata.url &&
    !metadata.protocolName &&
    !metadata.protocolIcon &&
    !metadata.description &&
    (!metadata.categories || metadata.categories.length === 0) &&
    !metadata.action
  );
}

function inferProtocol(
  stakingTokenName: string,
  stakingTokenSymbol: string,
): string {
  const name = stakingTokenName.toLowerCase();
  const symbol = stakingTokenSymbol.toLowerCase();

  if (name.includes("kodi") || symbol.includes("kodi")) {
    return "Kodiak";
  }
  if (name.includes("infrared") || symbol.includes("i-")) {
    return "Infrared";
  }
  if (name.includes("pendle") || symbol.includes("pendle")) {
    return "Pendle";
  }
  if (name.includes("beradrome")) {
    return "Beradrome";
  }
  if (name.includes("evk") || symbol.includes("elbgt")) {
    return "EVK";
  }
  if (name.includes("berapaw") || symbol.includes("berapaw")) {
    return "BeraPaw";
  }
  if (name.includes("smilee") || symbol.includes("smilee")) {
    return "Smilee";
  }
  if (name.includes("alpha vault") || symbol.includes("av")) {
    return "Charm";
  }
  if (name.includes("sweth") || symbol.includes("sweth")) {
    return "Swell";
  }

  return "UNKNOWN";
}

function inferCategory(
  stakingTokenName: string,
  stakingTokenSymbol: string,
): string[] {
  const name = stakingTokenName.toLowerCase();
  const symbol = stakingTokenSymbol.toLowerCase();

  if (
    name.includes("amm") ||
    name.includes("pool") ||
    name.includes("liquidity")
  ) {
    return ["defi/amm"];
  }
  if (name.includes("lending") || name.includes("lend")) {
    return ["defi/lending"];
  }
  if (
    name.includes("liquid") ||
    name.includes("stake") ||
    symbol.includes("elbgt")
  ) {
    return ["defi/liquid-staking"];
  }
  if (name.includes("yield") || name.includes("vault")) {
    return ["defi/yield"];
  }
  if (name.includes("derivative") || name.includes("pendle")) {
    return ["defi/derivatives"];
  }

  return ["defi/yield"];
}

async function findVaultsNotInApi() {
  const apiUrl = "https://api.berachain.com/";

  try {
    // Read vaults from mainnet.json
    const vaultsPath = join(process.cwd(), "src", "vaults", "mainnet.json");
    const content = JSON.parse(readFileSync(vaultsPath, "utf-8"));
    const localVaults = content.vaults as Array<{ vaultAddress: string }>;

    console.log(`Found ${localVaults.length} vaults in mainnet.json\n`);
    console.log("=".repeat(80));

    // Fetch all vaults from API (both whitelisted and non-whitelisted)
    const { addresses: apiVaultAddresses } = await fetchAllVaultsFromApi(
      apiUrl,
      true,
      false,
    );

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

async function removeVaultsNotInApi() {
  const apiUrl = "https://api.berachain.com/";

  try {
    // Read vaults from mainnet.json
    const vaultsPath = join(process.cwd(), "src", "vaults", "mainnet.json");
    const content = JSON.parse(readFileSync(vaultsPath, "utf-8"));
    const localVaults = content.vaults as Array<{ vaultAddress: string }>;

    console.log(`Found ${localVaults.length} vaults in mainnet.json\n`);
    console.log("=".repeat(80));

    // Fetch all vaults from API (both whitelisted and non-whitelisted)
    const { addresses: apiVaultAddresses } = await fetchAllVaultsFromApi(
      apiUrl,
      true,
      false,
    );

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

async function addVaultsFromApi() {
  const apiUrl = "https://api.berachain.com/";
  const pageSize = 100;
  let skip = 0;
  let totalFetched = 0;
  let totalCount = 0;
  const vaultsWithoutMetadata: Vault[] = [];

  console.log(
    "Querying Berachain GraphQL API for vaults without metadata...\n",
  );

  try {
    // First query to get total count
    const firstResponse = await queryVaults(apiUrl, 0, pageSize, false, true);
    totalCount = firstResponse.data.polGetRewardVaults.pagination.totalCount;
    console.log(`Total vaults in API: ${totalCount}\n`);

    // Process first batch
    const firstBatch = firstResponse.data.polGetRewardVaults.vaults;
    totalFetched += firstBatch.length;

    for (const vault of firstBatch) {
      if (hasNoMetadata(vault)) {
        vaultsWithoutMetadata.push(vault);
      }
    }

    console.log(
      `Fetched ${totalFetched}/${totalCount} vaults. Found ${vaultsWithoutMetadata.length} without metadata so far...`,
    );

    // Continue pagination
    skip = pageSize;
    while (skip < totalCount) {
      await new Promise((resolve) => setTimeout(resolve, 200));

      const response = await queryVaults(apiUrl, skip, pageSize, false, true);
      const batch = response.data.polGetRewardVaults.vaults;
      totalFetched += batch.length;

      for (const vault of batch) {
        if (hasNoMetadata(vault)) {
          vaultsWithoutMetadata.push(vault);
        }
      }

      console.log(
        `Fetched ${totalFetched}/${totalCount} vaults. Found ${vaultsWithoutMetadata.length} without metadata so far...`,
      );

      if (batch.length < pageSize) {
        break;
      }

      skip += pageSize;
    }

    console.log(
      `\nFound ${vaultsWithoutMetadata.length} vaults without metadata.\n`,
    );

    // Display summary
    if (vaultsWithoutMetadata.length > 0) {
      console.log("Vaults without metadata:");
      console.log("=".repeat(80));
      for (const vault of vaultsWithoutMetadata) {
        console.log(`\nVault Address: ${vault.vaultAddress}`);
        console.log(
          `  Staking Token: ${vault.stakingToken.symbol} (${vault.stakingToken.address})`,
        );
        console.log(
          `  TVL: ${vault.dynamicData.tvl != null ? `$${vault.dynamicData.tvl.toLocaleString()}` : "N/A"}`,
        );
        console.log(
          `  APR: ${vault.dynamicData.apr != null ? `${vault.dynamicData.apr}%` : "N/A"}`,
        );
        console.log(`  Whitelisted: ${vault.isVaultWhitelisted}`);
        console.log(
          `  Metadata: ${vault.metadata ? "exists but empty" : "null"}`,
        );
      }
    }

    // Read existing vaults file
    const vaultsPath = join(process.cwd(), "src", "vaults", "mainnet.json");
    const content = JSON.parse(readFileSync(vaultsPath, "utf-8"));
    const existingVaultAddresses = new Set(
      content.vaults.map((vault: { vaultAddress: string }) =>
        vault.vaultAddress.toLowerCase(),
      ),
    );

    let addedCount = 0;
    for (const vault of vaultsWithoutMetadata) {
      const vaultAddress = vault.vaultAddress.toLowerCase();
      if (existingVaultAddresses.has(vaultAddress)) {
        console.log(`\nSkipping ${vault.vaultAddress}: already exists`);
        continue;
      }

      const protocol = inferProtocol(
        vault.stakingToken.name,
        vault.stakingToken.symbol,
      );
      const categories = inferCategory(
        vault.stakingToken.name,
        vault.stakingToken.symbol,
      );

      const newVault = {
        stakingTokenAddress: vault.stakingToken.address,
        vaultAddress: vault.vaultAddress,
        name:
          vault.stakingToken.name ||
          vault.stakingToken.symbol ||
          "Unknown Vault",
        protocol: protocol,
        categories: categories,
        logoURI:
          "https://res.cloudinary.com/duv0g402y/image/upload/v1746534876/tokens/default.png",
        url: "https://hub.berachain.com",
        description: `Placeholder entry for ${vault.stakingToken.symbol} vault. Metadata needs to be added.`,
      };

      content.vaults.push(newVault);
      existingVaultAddresses.add(vaultAddress);
      addedCount++;
      console.log(
        `\nAdded vault: ${newVault.name} (${vault.vaultAddress}) - Protocol: ${protocol}`,
      );
    }

    if (addedCount > 0) {
      // DO NOT sort - preserve existing order, just append new vaults
      writeFileSync(vaultsPath, JSON.stringify(content, null, 2) + "\n");
      console.log(
        `\n✅ Added ${addedCount} new vault entries to ${vaultsPath}`,
      );
      console.log(
        "⚠️  Note: Existing vault order has been preserved. New vaults appended at the end.",
      );
    } else {
      console.log(
        "\n✅ All vaults without metadata already exist in mainnet.json",
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

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.error("Error: Must specify a command");
    console.log("\nUsage:");
    console.log(
      "  pnpm tsx scripts/manageVaultsFromApi.ts find    - Find vaults in metadata not in API",
    );
    console.log(
      "  pnpm tsx scripts/manageVaultsFromApi.ts remove  - Remove vaults not in API",
    );
    console.log(
      "  pnpm tsx scripts/manageVaultsFromApi.ts add      - Add vaults from API without metadata",
    );
    process.exit(1);
  }

  switch (command) {
    case "find":
      await findVaultsNotInApi();
      break;
    case "remove":
      await removeVaultsNotInApi();
      break;
    case "add":
      await addVaultsFromApi();
      break;
    default:
      console.error(`Error: Unknown command "${command}"`);
      console.log("\nAvailable commands:");
      console.log("  find    - Find vaults in metadata not in API");
      console.log("  remove  - Remove vaults not in API");
      console.log("  add     - Add vaults from API without metadata");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
