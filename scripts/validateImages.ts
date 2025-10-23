// Imports
// ================================================================
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import sharp from "sharp";
import { isAddress } from "viem";
import type { TokensFile } from "../src/types/tokens";
import type { ValidatorsFile } from "../src/types/validators";
import type { VaultsFile } from "../src/types/vaults";

// Config
// ================================================================
const METADATA_FOLDER = "src";
const ASSET_PATH = path.join(process.argv[2] ?? "", METADATA_FOLDER, "assets");
const METADATA_FOLDER_EXCLUDED = ["assets"];

// Functions
// ================================================================
/**
 * Validates if an Ethereum address is in proper checksum format
 * @param address - The address to validate
 * @returns true if the address is properly checksummed, false otherwise
 */
const isValidChecksumAddress = (address: string): boolean => {
  return isAddress(address);
};

/**
 * Reads the dimensions of an image file for PNG and JPG files
 * @param imagePath - The path to the image file
 * @returns The width and height of the image, or null if the file is not a valid image
 */
const getImageDimensions = (
  imagePath: string,
): { width: number; height: number } | null => {
  const buffer = fs.readFileSync(imagePath);

  // Check PNG header
  if (buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
    // PNG files start with 8 bytes: 89 50 4e 47 0d 0a 1a 0a
    // The width and height are located at bytes 16-19 (width) and 20-23 (height)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // Check JPG header
  if (buffer.slice(0, 2).toString("hex") === "ffd8") {
    // JPG files start with ff d8
    let i = 2;
    while (i < buffer.length) {
      // Get segment length (2 bytes)
      const segmentLength = buffer.readUInt16BE(i + 2);
      if (
        buffer[i] === 0xff &&
        buffer[i + 1] >= 0xc0 &&
        buffer[i + 1] <= 0xc3
      ) {
        // Start of frame (SOF) marker, contains width and height in the segment
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      i += segmentLength + 2;
    }
  }

  // Unsupported file format
  return null;
};

/**
 * Validates that a URL returns a 200 OK status
 * @param url - The URL to validate
 * @returns Promise<boolean> - true if the URL returns 200 OK, false otherwise
 */
const validateUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    console.warn(`Warning: Could not validate URL ${url}:`, error);
    return false;
  }
};

/**
 * Checks if a PNG image has transparent pixels
 * @param imagePath - The path to the PNG image file
 * @returns Promise<boolean> - true if the image has transparent pixels, false otherwise
 */
const hasTransparency = async (imagePath: string): Promise<boolean> => {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    // Only check PNG files for transparency
    if (metadata.format !== "png") {
      return false;
    }

    // Get the raw pixel data
    const { data } = await image
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    // Check if any pixel has an alpha value less than 255 (transparent)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn(
      `Warning: Could not check transparency for ${imagePath}:`,
      error,
    );
    return false;
  }
};

/**
 * Validates an image file for existence and transparency (for vaults)
 * @param filePath - Base path to the image file
 * @param name - Name of the item for error messages
 * @param id - ID of the item for error messages
 * @param warnings - Array to collect warnings
 * @param errors - Array to collect errors
 * @param checkTransparency - Whether to check for transparency (for vaults)
 * @param logoUri - Optional logo URI to validate
 */
const validateImageFile = async (
  filePath: string,
  name: string,
  id: string,
  warnings: string[],
  errors: string[],
  checkTransparency = false,
  logoUri?: string,
) => {
  // Check if image file exists
  const pngPath = `${filePath}.png`;
  const jpgPath = `${filePath}.jpg`;
  const jpegPath = `${filePath}.jpeg`;

  if (
    !fs.existsSync(pngPath) &&
    !fs.existsSync(jpgPath) &&
    !fs.existsSync(jpegPath)
  ) {
    errors.push(
      `${id}:\nIcon file not found in assets folder for ${name} (${id})!`,
    );
  } else if (checkTransparency && fs.existsSync(pngPath)) {
    // Check for transparency in PNG vault images
    const hasTransparentPixels = await hasTransparency(pngPath);
    if (hasTransparentPixels) {
      warnings.push(
        `${id}:\nVault image has transparent pixels for ${name} (${id})!`,
      );
    }
  }

  // Validate logo URI if provided
  if (logoUri) {
    const isValidUrl = await validateUrl(logoUri);
    if (!isValidUrl) {
      errors.push(
        `${id}:\nLogo URI returns non-200 status for ${name} (${id}): ${logoUri}`,
      );
    }
  }
};

/**
 * Checks all images in the assets folder for valid dimensions
 */
const validateAssetsImages = async () => {
  const errors: string[] = [];

  // Recursive function to process files in a directory
  const processDirectory = async (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await processDirectory(fullPath);
      } else if ([".DS_Store", "validator-default.png"].includes(entry.name)) {
        // Do nothing
      } else {
        // Check if file is an image
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
          const dimensions = getImageDimensions(fullPath);
          const relativePath = path.relative(ASSET_PATH, fullPath);

          // Validate file names
          if (relativePath.includes("tokens")) {
            const tokenRegex = /^0x[0-9a-f]{40}$/i;
            const address = relativePath
              .replace(ext, "")
              .replace("tokens/", "");
            if (!tokenRegex.test(address) && !entry.name.includes("default")) {
              errors.push(
                `${relativePath}: Invalid file name! Must be a valid token address.`,
              );
            } else if (!entry.name.includes("default")) {
              // Validate checksum for token addresses
              if (!isValidChecksumAddress(address)) {
                errors.push(
                  `${relativePath}: Invalid checksum address! Address must be in proper EIP-55 checksum format.`,
                );
              }
            }
          } else if (relativePath.includes("validators")) {
            const validatorRegex = /^0x[0-9a-f]{96}$/i;
            const address = relativePath
              .replace(ext, "")
              .replace("validators/", "");
            if (!validatorRegex.test(address)) {
              errors.push(
                `${relativePath}: Invalid file name! Must be a valid validator pubkey address.`,
              );
            }
            // Note: Validator addresses are 64-byte hashes, not Ethereum addresses, so no EIP-55 checksum validation needed
          } else if (relativePath.includes("vaults")) {
            const vaultRegex = /^0x[0-9a-f]{40}$/i;
            const address = relativePath
              .replace(ext, "")
              .replace("vaults/", "");
            if (!vaultRegex.test(address) && !entry.name.includes("default")) {
              errors.push(
                `${relativePath}: Invalid file name! Must be a valid vault address.`,
              );
            } else if (!entry.name.includes("default")) {
              // Validate checksum for vault addresses
              if (!isValidChecksumAddress(address)) {
                errors.push(
                  `${relativePath}: Invalid checksum address! Address must be in proper EIP-55 checksum format.`,
                );
              }
            }
          }

          if (dimensions === null) {
            errors.push(
              `${relativePath}: Unsupported file format. Unable to determine image dimensions.`,
            );
          }
          // Validate dimensions
          else if (
            dimensions.width < 1024 ||
            dimensions.height < 1024 ||
            dimensions?.width !== dimensions?.height
          ) {
            errors.push(
              `${relativePath}: Invalid (Dimensions: ${dimensions?.width}x${dimensions?.height})! Must be 1024x1024 pixels.`,
            );
          }

          // Check PNG files for transparency
          if (ext === ".png" && dimensions) {
            const hasTransparentPixels = await hasTransparency(fullPath);
            if (hasTransparentPixels) {
              errors.push(
                `${relativePath}: Invalid image! Image cannot have transparent pixels.`,
              );
            }
          }
        } else if (
          ext === ".webp" ||
          ext === ".gif" ||
          ext === ".bmp" ||
          ext === ".tiff"
        ) {
          errors.push(
            `${path.relative(ASSET_PATH, fullPath)}: Invalid file type! Only PNG and JPG images are allowed. Found: ${ext}`,
          );
        } else if (!entry.name.startsWith(".")) {
          // Only warn for non-hidden files that aren't images
          console.warn(
            `${path.relative(ASSET_PATH, fullPath)}: Non-image file found.`,
          );
        }
      }
    }
  };

  // Start processing from root folder
  await processDirectory(ASSET_PATH);

  if (errors.length > 0) {
    console.error(
      chalk.red.bold(`\n${errors.length} Errors found in assets folder:`),
    );
    errors.forEach((error) => console.error(chalk.red(`  ${error}`)));
    console.error(
      chalk.red.bold("\nPlease fix these issues before proceeding."),
    );
    process.exit(1); // Force exit with error code 1 to fail CI
  } else {
    console.log(chalk.green.bold("\nAll image validations passed!"));
  }
};

/**
 * Checks all images in the metadata folder for valid dimensions
 */
const validateMetadataImages = async () => {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for default.png in vaults folder
  const vaultsDefaultPath = path.join(ASSET_PATH, "vaults", "default.png");
  if (!fs.existsSync(vaultsDefaultPath)) {
    warnings.push("Warning: default.png not found in assets/vaults folder!");
  }

  // Get all the folders in the src folder excluding the 'METADATA_FOLDER_EXCLUDED' folder
  const folders = fs
    .readdirSync(METADATA_FOLDER, {
      withFileTypes: true,
    })
    .filter(
      (entry) =>
        entry.isDirectory() && !METADATA_FOLDER_EXCLUDED.includes(entry.name),
    )
    .map((entry) => entry.name);

  // Get all json files in all folders
  const jsonMetadata: {
    [key: string]: {
      [key: string]:
        | TokensFile["tokens"]
        | VaultsFile["vaults"]
        | ValidatorsFile["validators"];
    };
  } = {};
  for (const folder of folders) {
    fs.readdirSync(path.join(METADATA_FOLDER, folder), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => {
        const file = `${folder}/${entry.name}`;
        const content = JSON.parse(
          fs.readFileSync(path.join(METADATA_FOLDER, file), "utf8"),
        )?.[folder];

        if (!jsonMetadata[folder]) {
          jsonMetadata[folder] = {};
        }
        jsonMetadata[folder][`${entry.name}`] = content;

        return {
          folder,
          file,
          content,
        };
      });
  }

  // Validate all images in the assets folder from metadata
  for (const key of Object.keys(jsonMetadata)) {
    for (const file of Object.keys(jsonMetadata[key])) {
      if (key === "tokens") {
        const tokens = jsonMetadata[key][file] as TokensFile["tokens"];
        for (const token of tokens) {
          // Validate checksum address
          if (!isValidChecksumAddress(token.address)) {
            errors.push(
              `${token.address}:\nInvalid checksum address for token ${token.name} (${token.address})! Address must be in proper EIP-55 checksum format.`,
            );
          }

          const filePath = path.join(ASSET_PATH, key, token.address);
          await validateImageFile(
            filePath,
            token.name,
            token.address,
            warnings,
            errors,
            false,
            token.logoURI,
          );
        }
      } else if (key === "validators") {
        const validators = jsonMetadata[key][
          file
        ] as ValidatorsFile["validators"];
        for (const validator of validators) {
          // Note: Validator addresses are 64-byte hashes, not Ethereum addresses, so no EIP-55 checksum validation needed

          const filePath = path.join(ASSET_PATH, key, validator.id);
          await validateImageFile(
            filePath,
            validator.name,
            validator.id,
            warnings,
            errors,
            false,
            validator.logoURI,
          );
        }
      } else if (key === "vaults") {
        const vaults = jsonMetadata[key][file] as VaultsFile["vaults"];
        for (const vault of vaults) {
          // Validate checksum address
          if (!isValidChecksumAddress(vault.vaultAddress)) {
            errors.push(
              `${vault.vaultAddress}:\nInvalid checksum address for vault ${vault.name} (${vault.vaultAddress})! Address must be in proper EIP-55 checksum format.`,
            );
          }

          const filePath = path.join(ASSET_PATH, key, vault.vaultAddress);
          await validateImageFile(
            filePath,
            vault.name,
            vault.vaultAddress,
            warnings,
            errors,
            true,
            vault.logoURI,
          );
        }
      } else {
        throw new Error(`Invalid key: ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(
      chalk.red.bold(`\n${errors.length} Errors found in metadata:`),
    );
    errors.forEach((error) => console.error(chalk.red(`  ${error}`)));
    console.error(
      chalk.red.bold("\nPlease fix these issues before proceeding."),
    );
    process.exit(1); // Force exit with error code 1 to fail CI
  }

  if (warnings.length > 0) {
    console.warn(
      chalk.yellow.bold(`\n${warnings.length} Warnings found in metadata:`),
    );
    warnings.forEach((error) => console.warn(chalk.yellow(`  ${error}`)));
  } else {
    console.log(chalk.green.bold("\nAll metadata validations passed!"));
  }
};

// Initialize
// ================================================================
const main = async () => {
  await validateAssetsImages();
  await validateMetadataImages();
};

main().catch((error) => {
  console.error("Error during validation:", error);
  process.exit(1);
});
