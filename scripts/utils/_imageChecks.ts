import fs from "node:fs";
import sharp from "sharp";
import { isAddress } from "viem";

/**
 * Validates if an Ethereum address is in proper EIP-55 checksum format.
 */
export const isValidChecksumAddress = (address: string): boolean => {
  return isAddress(address);
};

/**
 * Reads the dimensions of a PNG or JPG file from its header bytes.
 * Returns null for unsupported formats.
 */
export const getImageDimensions = (
  imagePath: string,
): { width: number; height: number } | null => {
  const buffer = fs.readFileSync(imagePath);

  // PNG: 89 50 4e 47 0d 0a 1a 0a, width/height at bytes 16-19 / 20-23
  if (buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPG: ff d8, scan for SOF marker (0xC0-0xC3) to extract dimensions
  if (buffer.slice(0, 2).toString("hex") === "ffd8") {
    let i = 2;
    while (i < buffer.length) {
      const segmentLength = buffer.readUInt16BE(i + 2);
      if (
        buffer[i] === 0xff &&
        buffer[i + 1] >= 0xc0 &&
        buffer[i + 1] <= 0xc3
      ) {
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      i += segmentLength + 2;
    }
  }

  return null;
};

/**
 * Checks if a PNG image has any transparent pixels. Returns false for non-PNG.
 */
export const hasTransparency = async (imagePath: string): Promise<boolean> => {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (metadata.format !== "png") {
      return false;
    }

    const { data } = await image
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

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
