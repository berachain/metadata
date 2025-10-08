// Imports
// ================================================================
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import sharp from "sharp";

// Config
// ================================================================
const METADATA_FOLDER = "src";
const ASSET_PATH = path.join(process.argv[2] ?? "", METADATA_FOLDER, "assets");

// Functions
// ================================================================
/**
 * Fixes an image by resizing to 1024x1024 and removing transparency
 * @param imagePath - The path to the image file
 * @returns Promise<boolean> - true if successful, false otherwise
 */
const fixImage = async (imagePath: string): Promise<boolean> => {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    // Check if already correct dimensions and format
    if (
      metadata.width === 1024 &&
      metadata.height === 1024 &&
      metadata.format === "png"
    ) {
      // Check for transparency
      const { data } = await image
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

      let hasTransparency = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasTransparency = true;
          break;
        }
      }

      if (!hasTransparency) {
        console.log(
          chalk.green(
            `Already correct: ${path.relative(ASSET_PATH, imagePath)}`,
          ),
        );
        return true;
      }
    }

    // Create temporary file path
    const tempPath = `${imagePath}.tmp`;

    // Resize to 1024x1024 and remove transparency by adding white background
    await image
      .resize(1024, 1024, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .removeAlpha()
      .png()
      .toFile(tempPath);

    // Replace original file with fixed version
    fs.renameSync(tempPath, imagePath);

    console.log(chalk.blue(`Fixed: ${path.relative(ASSET_PATH, imagePath)}`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error fixing ${imagePath}:`, error));
    return false;
  }
};

/**
 * Processes all images in the assets folder
 */
const fixAllImages = async () => {
  console.log(chalk.blue.bold("Fixing image dimensions and transparency..."));

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
          if (await fixImage(fullPath)) {
            fixed++;
          } else {
            failed++;
          }
        }
      }
    }
  };

  // Start processing from root folder
  await processDirectory(ASSET_PATH);

  console.log(
    chalk.blue.bold(
      `\nImage fixing completed: ${fixed} fixed, ${failed} failed`,
    ),
  );
};

// Initialize
// ================================================================
const main = async () => {
  await fixAllImages();
};

main().catch((error) => {
  console.error("Error during image fixing:", error);
  process.exit(1);
});
