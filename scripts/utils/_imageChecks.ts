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
 * Reads image dimensions straight out of the file header — no decode, no
 * third-party dep. PNG has a fixed layout so it's a direct offset read; JPG
 * stores dimensions inside a variable-length chain of markers so we walk the
 * segments until we find a Start-Of-Frame. Returns null for anything else
 * (webp/gif/bmp/tiff are rejected upstream).
 */
export const getImageDimensions = (
  imagePath: string,
): { width: number; height: number } | null => {
  const buffer = fs.readFileSync(imagePath);

  // PNG signature is the fixed 8-byte magic "89 50 4E 47 0D 0A 1A 0A".
  // The IHDR chunk starts at byte 8 and its layout is spec-pinned:
  //   [8..11]  chunk length     (always 13 for IHDR)
  //   [12..15] chunk type       ("IHDR")
  //   [16..19] width            (big-endian uint32)
  //   [20..23] height           (big-endian uint32)
  // Because IHDR is always the first chunk, we can read the dimensions
  // directly at those offsets without parsing anything else.
  if (buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPG starts with the SOI marker "FF D8". The file is a sequence of
  // markers, each shaped like:
  //   FF <marker-code> <length:uint16 BE> <payload of (length-2) bytes>
  // Dimensions live in a Start-Of-Frame (SOF) marker — codes 0xC0..0xC3
  // cover the common baseline/progressive/lossless variants. The SOF
  // payload layout is:
  //   +0  precision (1 byte)
  //   +1  height    (uint16 BE)
  //   +3  width     (uint16 BE)
  // Relative to the marker's FF byte at index i, that's i+5 / i+7.
  //
  // We walk the marker chain by jumping (segmentLength + 2) bytes each
  // iteration — +2 accounts for the FF/code bytes that aren't part of the
  // declared length. We stop as soon as we hit an SOF.
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
