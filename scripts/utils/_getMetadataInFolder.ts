import fs from "node:fs";
import path from "node:path";
import type { TokensFile } from "../../src/types/tokens";
import type { ValidatorsFile } from "../../src/types/validators";
import type { VaultsFile } from "../../src/types/vaults";
import type { ValidChainName } from "../_constants";
import { isValidChainName } from "./_isValidChainName";
/**
 * Reads and parses metadata files from a specified folder
 * @param folder - The folder to read from ('validators', 'tokens', or 'vaults')
 * @returns Array of parsed metadata objects with chain, content, raw content, and file path
 * @throws Error if folder doesn't exist or contains invalid files
 */
export function getMetadataInFolder<
  T extends "validators" | "tokens" | "vaults",
>(
  folder: T,
): {
  chain: ValidChainName;
  content: T extends "tokens"
    ? TokensFile
    : T extends "vaults"
      ? VaultsFile
      : ValidatorsFile;
  /**
   * Used for annotations
   */
  rawContent: string;
  path: string;
}[] {
  const folderPath = path.join(process.argv[2] ?? "", "src", folder);

  return fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const chain = file.split(".json")[0];

      if (!isValidChainName(chain)) {
        throw new Error(`Invalid chain name: ${chain}`);
      }

      const rawContent = fs.readFileSync(path.join(folderPath, file), "utf8");
      const content = JSON.parse(rawContent);

      return {
        chain,
        content,
        rawContent,
        path: path.join(folderPath, file),
      };
    });
}
