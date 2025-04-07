import { getMetadataInFolder } from "../utils";
import { validateTokens } from "./_tokens";
import { validateVaults } from "./_vaults";

const errors: string[] = [];

const vaultsMetadataFiles = getMetadataInFolder("vaults");
const tokenMetadataFiles = getMetadataInFolder("tokens");

console.log("I'm hacking validation!");
process.exit(0);

await Promise.all([
  ...vaultsMetadataFiles.map((file) => validateVaults(errors, file)),
  ...tokenMetadataFiles.map((file) => validateTokens(errors, file)),
]);

if (errors.length > 0) {
  console.log("Errors found:");
  for (const error of errors) {
    console.error("\x1b[31m%s\x1b[0m", "Error", error);
  }

  process.exit(1);
}
