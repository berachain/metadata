// Imports
// ================================================================
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { TokensFile } from "../src/types/tokens";
import type { VaultsFile } from "../src/types/vaults";

// Config
// ================================================================
const METADATA_FOLDER = "src";
const ASSET_PATH = path.join(process.argv[2] ?? "", METADATA_FOLDER, "assets");

// Functions
// ================================================================
/**
 * Downloads an image from a URL and saves it to the specified path
 * @param url - The URL to download from
 * @param filePath - The local file path to save to
 * @returns Promise<boolean> - true if successful, false otherwise
 */
const downloadImage = async (
  url: string,
  filePath: string,
): Promise<boolean> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        chalk.yellow(`Failed to download ${url}: ${response.status}`),
      );
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);
    console.log(
      chalk.green(`Downloaded: ${path.relative(ASSET_PATH, filePath)}`),
    );
    return true;
  } catch (error) {
    console.warn(chalk.yellow(`Error downloading ${url}:`, error));
    return false;
  }
};

/**
 * Determines the file extension from URL or content type
 * @param url - The URL to check
 * @param contentType - The content type from response headers
 * @returns The file extension (with dot)
 */
const getFileExtension = (url: string, contentType?: string): string => {
  // Check content type first
  if (contentType) {
    if (contentType.includes("image/png")) return ".png";
    if (contentType.includes("image/jpeg") || contentType.includes("image/jpg"))
      return ".jpg";
    if (contentType.includes("image/webp")) return ".webp";
  }

  // Fallback to URL extension
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return ext;
  }

  // Default to PNG
  return ".png";
};

/**
 * Downloads missing token icons
 */
const downloadMissingTokenIcons = async () => {
  console.log(chalk.blue.bold("Downloading missing token icons..."));

  const tokensFile = path.join(METADATA_FOLDER, "tokens", "mainnet.json");
  const content = JSON.parse(fs.readFileSync(tokensFile, "utf8")) as TokensFile;

  let downloaded = 0;
  let failed = 0;

  for (const token of content.tokens) {
    const tokenPath = path.join(ASSET_PATH, "tokens", token.address);
    const pngPath = `${tokenPath}.png`;
    const jpgPath = `${tokenPath}.jpg`;
    const jpegPath = `${tokenPath}.jpeg`;

    // Check if icon already exists
    if (
      fs.existsSync(pngPath) ||
      fs.existsSync(jpgPath) ||
      fs.existsSync(jpegPath)
    ) {
      continue;
    }

    if (!token.logoURI) {
      console.warn(
        chalk.yellow(`No logoURI for token ${token.name} (${token.address})`),
      );
      failed++;
      continue;
    }

    // Try to download with different extensions
    const extensions = [".png", ".jpg", ".jpeg"];
    let success = false;

    for (const ext of extensions) {
      const filePath = `${tokenPath}${ext}`;
      if (await downloadImage(token.logoURI, filePath)) {
        downloaded++;
        success = true;
        break;
      }
    }

    if (!success) {
      failed++;
    }
  }

  console.log(
    chalk.blue.bold(`Token icons: ${downloaded} downloaded, ${failed} failed`),
  );
};

/**
 * Downloads missing vault icons
 */
const downloadMissingVaultIcons = async () => {
  console.log(chalk.blue.bold("Downloading missing vault icons..."));

  const vaultsFile = path.join(METADATA_FOLDER, "vaults", "mainnet.json");
  const content = JSON.parse(fs.readFileSync(vaultsFile, "utf8")) as VaultsFile;

  let downloaded = 0;
  let failed = 0;

  for (const vault of content.vaults) {
    const vaultPath = path.join(ASSET_PATH, "vaults", vault.vaultAddress);
    const pngPath = `${vaultPath}.png`;
    const jpgPath = `${vaultPath}.jpg`;
    const jpegPath = `${vaultPath}.jpeg`;

    // Check if icon already exists
    if (
      fs.existsSync(pngPath) ||
      fs.existsSync(jpgPath) ||
      fs.existsSync(jpegPath)
    ) {
      continue;
    }

    if (!vault.logoURI) {
      console.warn(
        chalk.yellow(
          `No logoURI for vault ${vault.name} (${vault.vaultAddress})`,
        ),
      );
      failed++;
      continue;
    }

    // Try to download with different extensions
    const extensions = [".png", ".jpg", ".jpeg"];
    let success = false;

    for (const ext of extensions) {
      const filePath = `${vaultPath}${ext}`;
      if (await downloadImage(vault.logoURI, filePath)) {
        downloaded++;
        success = true;
        break;
      }
    }

    if (!success) {
      failed++;
    }
  }

  console.log(
    chalk.blue.bold(`Vault icons: ${downloaded} downloaded, ${failed} failed`),
  );
};

// Initialize
// ================================================================
const main = async () => {
  console.log(chalk.blue.bold("Starting download of missing icons..."));

  await downloadMissingTokenIcons();
  await downloadMissingVaultIcons();

  console.log(chalk.green.bold("Download process completed!"));
};

main().catch((error) => {
  console.error("Error during download:", error);
  process.exit(1);
});
