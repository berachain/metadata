import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Address } from "viem";
import { getAddress } from "viem";

// Load environment variables from .env file if it exists
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join("=").trim();
      }
    }
  });
}
import type { VaultsFile } from "../src/types/vaults";
import type { TokensFile } from "../src/types/tokens";
import type { ValidChainName } from "./_constants";
import { getProtocolBrandColor } from "./_constants";
import { clients } from "./utils";
import { downloadTokenImages } from "./imageGeneration/downloadTokenImages";
import { fetchLPTokens } from "./imageGeneration/fetchLPTokens";
import { mergeTokenImages } from "./imageGeneration/mergeImages";
import {
  configureCloudinary,
  uploadVaultImage,
} from "./imageGeneration/uploadToCloudinary";
import { updateVaultLogoURI } from "./imageGeneration/updateMetadata";

// Parse command line arguments
const args = process.argv.slice(2);
const vaultAddressArg = args.find((arg) => arg.startsWith("--vault-address="));
const chainArg = args.find((arg) => arg.startsWith("--chain="));
const brandColorArg = args.find((arg) => arg.startsWith("--brand-color="));
const allFlag = args.includes("--all");
const dryRunFlag = args.includes("--dry-run");
const forceFlag = args.includes("--force");
const saveLocalFlag = args.includes("--save-local");

const chain: ValidChainName =
  (chainArg?.split("=")[1] as ValidChainName) || "mainnet";
const vaultAddress = vaultAddressArg?.split("=")[1];
const brandColorOverride = brandColorArg?.split("=")[1];

// Validation
if (!allFlag && !vaultAddress) {
  console.error(
    chalk.red("Error: Must specify either --vault-address or --all"),
  );
  console.log("\nUsage:");
  console.log(
    "  pnpm generate:vault-images --vault-address=0x... --chain=mainnet",
  );
  console.log("  pnpm generate:vault-images --all --chain=mainnet");
  console.log("  pnpm generate:vault-images --all --dry-run");
  console.log("  pnpm generate:vault-images --vault-address=0x... --save-local");
  console.log("  pnpm generate:vault-images --vault-address=0x... --brand-color=#0066FF");
  process.exit(1);
}

// Create local output directory if --save-local is enabled
const LOCAL_OUTPUT_DIR = path.join(process.cwd(), "generated-vault-images");
if (saveLocalFlag && !fs.existsSync(LOCAL_OUTPUT_DIR)) {
  fs.mkdirSync(LOCAL_OUTPUT_DIR, { recursive: true });
}

/**
 * Loads token metadata to get logoURIs
 */
function loadTokenMetadata(chain: ValidChainName): Map<string, string> {
  const filePath = path.join(process.cwd(), "src", "tokens", `${chain}.json`);
  const tokenMap = new Map<string, string>();

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const tokensData: TokensFile = JSON.parse(fileContent);

    for (const token of tokensData.tokens) {
      if (token.logoURI) {
        tokenMap.set(token.address.toLowerCase(), token.logoURI);
      }
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not load token metadata`));
  }

  return tokenMap;
}

/**
 * Loads vault metadata
 */
function loadVaultMetadata(chain: ValidChainName): VaultsFile {
  const filePath = path.join(process.cwd(), "src", "vaults", `${chain}.json`);
  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent);
}

/**
 * Generates a vault image and uploads it
 */
async function generateVaultImage(
  vaultAddress: Address,
  chain: ValidChainName,
  tokenMetadata: Map<string, string>,
  vaultsData: VaultsFile,
): Promise<boolean> {
  console.log(chalk.blue(`\nProcessing vault: ${vaultAddress}`));

  try {
    // Step 0: Get staking token address from vault metadata
    const vault = vaultsData.vaults.find(
      (v) => v.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
    );

    if (!vault) {
      console.error(chalk.red(`  Error: Vault ${vaultAddress} not found in metadata`));
      return false;
    }

    const stakingTokenAddress = getAddress(vault.stakingTokenAddress);
    console.log(`  Staking token: ${stakingTokenAddress}`);

    // Step 1: Fetch LP token information
    console.log("  Fetching LP token info...");
    const client = clients[chain];
    const lpInfo = await fetchLPTokens(stakingTokenAddress, client);

    console.log(
      `  Found ${lpInfo.underlyingTokens.length} underlying token(s)`,
    );

    // Step 2: Download token images
    console.log("  Downloading token images...");
    const tokenImages = await downloadTokenImages(
      lpInfo.underlyingTokens,
      chain,
      tokenMetadata,
    );

    // Check if all images were found
    const missingImages = tokenImages.filter((img) => !img.found);
    if (missingImages.length > 0) {
      console.warn(
        chalk.yellow(
          `  Warning: Missing images for ${missingImages.length} token(s)`,
        ),
      );
      for (const missing of missingImages) {
        console.warn(chalk.yellow(`    - ${missing.tokenAddress}`));
      }
      console.log(chalk.yellow("  Skipping vault due to missing images"));
      return false;
    }

    // Step 3: Merge images
    console.log("  Merging token images...");
    const imageBuffers = tokenImages
      .map((img) => img.imageBuffer)
      .filter((buf): buf is Buffer => buf !== null);

    // Determine brand color (CLI override > owner lookup > none)
    let brandColor = brandColorOverride;
    if (!brandColor) {
      // Only use owner field for brand color lookup
      if (vault.owner) {
        const ownerColor = getProtocolBrandColor(vault.owner);
        if (ownerColor) {
          brandColor = ownerColor;
          console.log(`  Using ${vault.owner} brand color: ${brandColor}`);
        }
      }
    } else if (brandColor) {
      console.log(`  Using custom brand color: ${brandColor}`);
    }

    const mergedImage = await mergeTokenImages(imageBuffers, brandColor);
    if (!mergedImage) {
      console.error(chalk.red("  Error: Failed to merge images"));
      return false;
    }

    // Save locally if --save-local flag is set
    if (saveLocalFlag) {
      const localImagePath = path.join(
        LOCAL_OUTPUT_DIR,
        `${vaultAddress}.jpg`,
      );
      fs.writeFileSync(localImagePath, mergedImage);
      console.log(chalk.green(`  Saved locally: ${localImagePath}`));
    }

    if (dryRunFlag) {
      console.log(chalk.cyan("  [DRY RUN] Would upload image to Cloudinary"));
      console.log(
        chalk.cyan("  [DRY RUN] Would update metadata with logoURI"),
      );
      return true;
    }

    // Step 4: Upload to Cloudinary
    console.log("  Uploading to Cloudinary...");
    const uploadResult = await uploadVaultImage(mergedImage, vaultAddress);

    if (!uploadResult.success) {
      console.error(
        chalk.red(`  Error: Upload failed - ${uploadResult.error}`),
      );
      return false;
    }

    console.log(chalk.green(`  Uploaded: ${uploadResult.url}`));

    // Step 5: Update metadata
    console.log("  Updating metadata...");
    const updateResult = updateVaultLogoURI(
      vaultAddress,
      uploadResult.url!,
      chain,
    );

    if (!updateResult.success) {
      console.error(
        chalk.red(`  Error: Metadata update failed - ${updateResult.error}`),
      );
      return false;
    }

    console.log(chalk.green(`  Successfully generated vault image!`));
    return true;
  } catch (error) {
    console.error(
      chalk.red(`  Error: ${error instanceof Error ? error.message : String(error)}`),
    );
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(chalk.bold("\n🎨 Vault Image Generator\n"));

  // Configure Cloudinary (unless dry run)
  if (!dryRunFlag) {
    try {
      configureCloudinary();
      console.log(chalk.green("✓ Cloudinary configured"));
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      process.exit(1);
    }
  }

  // Load metadata
  console.log(chalk.blue(`Loading metadata for ${chain}...`));
  const tokenMetadata = loadTokenMetadata(chain);
  const vaultsData = loadVaultMetadata(chain);
  console.log(
    chalk.green(`✓ Loaded ${vaultsData.vaults.length} vault(s)\n`),
  );

  let vaultsToProcess: Address[] = [];

  if (allFlag) {
    // Process all vaults (optionally skip those with logoURI unless --force)
    vaultsToProcess = vaultsData.vaults
      .filter((vault) => {
        if (forceFlag) return true;
        return !vault.logoURI || vault.logoURI.trim() === "";
      })
      .map((vault) => getAddress(vault.vaultAddress));

    console.log(
      chalk.blue(
        `Processing ${vaultsToProcess.length} vault(s) ${forceFlag ? "(forced)" : "without logoURI"}`,
      ),
    );
  } else if (vaultAddress) {
    vaultsToProcess = [getAddress(vaultAddress)];
  }

  // Process each vault
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const addr of vaultsToProcess) {
    const result = await generateVaultImage(addr, chain, tokenMetadata, vaultsData);
    if (result) {
      successCount++;
    } else {
      const vault = vaultsData.vaults.find(
        (v) => v.vaultAddress.toLowerCase() === addr.toLowerCase(),
      );
      if (
        vault &&
        tokenMetadata.size === 0 &&
        !vault.logoURI
      ) {
        skipCount++;
      } else {
        failCount++;
      }
    }
  }

  // Summary
  console.log(chalk.bold("\n📊 Summary:"));
  console.log(chalk.green(`  ✓ Success: ${successCount}`));
  if (skipCount > 0) {
    console.log(chalk.yellow(`  ⊘ Skipped: ${skipCount}`));
  }
  if (failCount > 0) {
    console.log(chalk.red(`  ✗ Failed: ${failCount}`));
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
