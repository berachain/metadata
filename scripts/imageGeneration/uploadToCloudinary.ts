import { v2 as cloudinary } from "cloudinary";
import type { Address } from "viem";
import { getAddress } from "viem";

export interface CloudinaryUploadResult {
  success: boolean;
  url: string | null;
  error?: string;
}

/**
 * Configures Cloudinary with credentials from environment variables
 */
export function configureCloudinary(): void {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary credentials. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env file",
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

/**
 * Uploads a vault image to Cloudinary
 * @param imageBuffer - The image buffer to upload
 * @param vaultAddress - The vault address (used for naming)
 * @returns CloudinaryUploadResult with URL or error
 */
export async function uploadVaultImage(
  imageBuffer: Buffer,
  vaultAddress: Address,
): Promise<CloudinaryUploadResult> {
  try {
    const checksummedAddress = getAddress(vaultAddress);

    // Convert buffer to base64 data URL
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: "vaults",
      public_id: checksummedAddress,
      overwrite: true,
      resource_type: "image",
      format: "jpg", // Convert to JPG for consistency
    });

    return {
      success: true,
      url: result.secure_url,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`Failed to upload vault image: ${errorMessage}`);
    return {
      success: false,
      url: null,
      error: errorMessage,
    };
  }
}

/**
 * Checks if an image already exists in Cloudinary
 * @param vaultAddress - The vault address to check
 * @returns boolean indicating if image exists
 */
export async function checkImageExists(
  vaultAddress: Address,
): Promise<boolean> {
  try {
    const checksummedAddress = getAddress(vaultAddress);
    await cloudinary.api.resource(`vaults/${checksummedAddress}`, {
      resource_type: "image",
    });
    return true;
  } catch (error) {
    // Image doesn't exist
    return false;
  }
}

/**
 * Deletes a vault image from Cloudinary
 * @param vaultAddress - The vault address to delete
 * @returns boolean indicating success
 */
export async function deleteVaultImage(
  vaultAddress: Address,
): Promise<boolean> {
  try {
    const checksummedAddress = getAddress(vaultAddress);
    await cloudinary.uploader.destroy(`vaults/${checksummedAddress}`, {
      resource_type: "image",
    });
    return true;
  } catch (error) {
    console.error(`Failed to delete vault image:`, error);
    return false;
  }
}
