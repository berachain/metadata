import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import { getAddress } from "viem";

export interface TokenImageInfo {
  tokenAddress: Address;
  imagePath: string | null;
  imageBuffer: Buffer | null;
  found: boolean;
}

/**
 * Attempts to find and load a token image from local assets
 * Checks for both PNG and JPG formats with checksummed address
 */
export function findLocalTokenImage(
  tokenAddress: Address,
  chain: string,
): string | null {
  const checksummedAddress = getAddress(tokenAddress);
  const assetsPath = path.join(
    process.cwd(),
    "src",
    "assets",
    "tokens",
  );

  // Check for PNG first, then JPG
  const pngPath = path.join(assetsPath, `${checksummedAddress}.png`);
  const jpgPath = path.join(assetsPath, `${checksummedAddress}.jpg`);
  const jpegPath = path.join(assetsPath, `${checksummedAddress}.jpeg`);

  if (fs.existsSync(pngPath)) {
    return pngPath;
  }
  if (fs.existsSync(jpgPath)) {
    return jpgPath;
  }
  if (fs.existsSync(jpegPath)) {
    return jpegPath;
  }

  return null;
}

/**
 * Downloads a token image from a URL
 * @param url - The logoURI URL to download from
 * @returns Buffer of the image data, or null if download fails
 */
export async function downloadImageFromURL(
  url: string,
): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to download image from ${url}: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn(`Error downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Fetches token image, trying local assets first, then logoURI
 * @param tokenAddress - The token address
 * @param chain - The chain name (mainnet/bepolia)
 * @param logoURI - Optional logoURI to fallback to
 * @returns TokenImageInfo with image data or null if not found
 */
export async function downloadTokenImage(
  tokenAddress: Address,
  chain: string,
  logoURI?: string,
): Promise<TokenImageInfo> {
  // Try local assets first
  const localPath = findLocalTokenImage(tokenAddress, chain);
  if (localPath) {
    try {
      const imageBuffer = fs.readFileSync(localPath);
      return {
        tokenAddress,
        imagePath: localPath,
        imageBuffer,
        found: true,
      };
    } catch (error) {
      console.warn(`Error reading local image at ${localPath}:`, error);
    }
  }

  // Fallback to logoURI if provided
  if (logoURI) {
    const imageBuffer = await downloadImageFromURL(logoURI);
    if (imageBuffer) {
      return {
        tokenAddress,
        imagePath: null,
        imageBuffer,
        found: true,
      };
    }
  }

  // Image not found
  return {
    tokenAddress,
    imagePath: null,
    imageBuffer: null,
    found: false,
  };
}

/**
 * Downloads all token images for an array of token addresses
 * @param tokenAddresses - Array of token addresses
 * @param chain - The chain name
 * @param tokenMetadata - Optional map of token address to logoURI
 * @returns Array of TokenImageInfo
 */
export async function downloadTokenImages(
  tokenAddresses: Address[],
  chain: string,
  tokenMetadata?: Map<string, string>,
): Promise<TokenImageInfo[]> {
  const results = await Promise.all(
    tokenAddresses.map((address) => {
      const logoURI = tokenMetadata?.get(address.toLowerCase());
      return downloadTokenImage(address, chain, logoURI);
    }),
  );

  return results;
}
