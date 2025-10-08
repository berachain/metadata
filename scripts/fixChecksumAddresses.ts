// Imports
// ================================================================
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getAddress } from "viem";

// Config
// ================================================================
const METADATA_FOLDER = "src";
const ASSET_PATH = path.join(process.argv[2] ?? "", METADATA_FOLDER, "assets");

// Functions
// ================================================================
/**
 * Fixes checksum addresses by renaming files to proper EIP-55 format
 */
const fixChecksumAddresses = async () => {
  console.log(chalk.blue.bold("Fixing checksum addresses..."));

  let fixed = 0;
  let failed = 0;

  // Recursive function to process files in a directory
  const processDirectory = async (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await processDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
          const fileName = entry.name.replace(ext, "");

          // Skip default files
          if (fileName.includes("default")) {
            continue;
          }

          // Check if it's an address (starts with 0x)
          if (fileName.startsWith("0x")) {
            try {
              const checksumAddress = getAddress(fileName);
              const newFileName = checksumAddress + ext;
              const newPath = path.join(dirPath, newFileName);

              // Only rename if the checksum is different
              if (fileName !== checksumAddress) {
                fs.renameSync(fullPath, newPath);
                console.log(
                  chalk.green(
                    `Fixed: ${path.relative(ASSET_PATH, fullPath)} -> ${path.relative(ASSET_PATH, newPath)}`,
                  ),
                );
                fixed++;
              }
            } catch (error) {
              console.warn(chalk.yellow(`Invalid address format: ${fullPath}`));
              failed++;
            }
          }
        }
      }
    }
  };

  // Start processing from root folder
  await processDirectory(ASSET_PATH);

  console.log(
    chalk.blue.bold(
      `\nChecksum fixing completed: ${fixed} fixed, ${failed} failed`,
    ),
  );
};

// Initialize
// ================================================================
const main = async () => {
  await fixChecksumAddresses();
};

main().catch((error) => {
  console.error("Error during checksum fixing:", error);
  process.exit(1);
});
