import { getMetadataInFolder } from "../utils";
import { validateTokens } from "./_tokens";
import { validateVaults } from "./_vaults";

const errors: string[] = [];

const vaultsMetadataFiles = getMetadataInFolder("vaults");
const tokenMetadataFiles = getMetadataInFolder("tokens");

await Promise.all([
  ...vaultsMetadataFiles.map((file) => validateVaults(errors, file)),
  ...tokenMetadataFiles.map((file) => validateTokens(errors, file)),
]);

if (errors.length > 0) {
  console.log("Warnings found:");
  for (const error of errors) {
    console.warn("\x1b[33m%s\x1b[0m", "Warning", error);
  }
}
