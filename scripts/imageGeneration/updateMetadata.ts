import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import type { VaultsFile } from "../../src/types/vaults";

export interface MetadataUpdateResult {
  success: boolean;
  filePath: string;
  vaultAddress: Address;
  error?: string;
}

/**
 * Updates the logoURI for a vault in the metadata JSON file
 * @param vaultAddress - The vault address to update
 * @param logoURI - The new Cloudinary URL
 * @param chain - The chain name (mainnet/bepolia)
 * @returns MetadataUpdateResult
 */
export function updateVaultLogoURI(
  vaultAddress: Address,
  logoURI: string,
  chain: string,
): MetadataUpdateResult {
  const filePath = path.join(process.cwd(), "src", "vaults", `${chain}.json`);

  try {
    // Read the existing file
    const fileContent = fs.readFileSync(filePath, "utf8");
    const vaultsData: VaultsFile = JSON.parse(fileContent);

    // Find the vault by address (case-insensitive)
    const vaultIndex = vaultsData.vaults.findIndex(
      (v) => v.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
    );

    if (vaultIndex === -1) {
      return {
        success: false,
        filePath,
        vaultAddress,
        error: `Vault with address ${vaultAddress} not found in ${filePath}`,
      };
    }

    // Update the logoURI
    vaultsData.vaults[vaultIndex].logoURI = logoURI;

    // Write back to file with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(vaultsData, null, 2) + "\n");

    return {
      success: true,
      filePath,
      vaultAddress,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filePath,
      vaultAddress,
      error: errorMessage,
    };
  }
}

/**
 * Gets the current logoURI for a vault
 * @param vaultAddress - The vault address
 * @param chain - The chain name
 * @returns The current logoURI or null if not found
 */
export function getVaultLogoURI(
  vaultAddress: Address,
  chain: string,
): string | null {
  const filePath = path.join(process.cwd(), "src", "vaults", `${chain}.json`);

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const vaultsData: VaultsFile = JSON.parse(fileContent);

    const vault = vaultsData.vaults.find(
      (v) => v.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
    );

    return vault?.logoURI || null;
  } catch (error) {
    console.error(`Error reading vault metadata:`, error);
    return null;
  }
}

/**
 * Checks if a vault has a logoURI set
 * @param vaultAddress - The vault address
 * @param chain - The chain name
 * @returns boolean indicating if logoURI exists
 */
export function hasVaultLogoURI(
  vaultAddress: Address,
  chain: string,
): boolean {
  const logoURI = getVaultLogoURI(vaultAddress, chain);
  return logoURI !== null && logoURI.trim() !== "";
}
