import fs from "node:fs";
import path from "node:path";

import type { ValidChainName } from "../_constants";

import type tokensType from "../../src/tokens/mainnet.json";
import type validatorsType from "../../src/validators/mainnet.json";
import type vaultsType from "../../src/vaults/mainnet.json";
import { isValidChainName } from "./_isValidChainName";
/**
 * Parses all JSON files in the `src/{folder}` directory.
 * @returns
 */
export function getMetadataInFolder<
  T extends "validators" | "tokens" | "vaults",
>(
  folder: T,
): {
  chain: ValidChainName;
  content: T extends "tokens"
    ? typeof tokensType
    : T extends "vaults"
      ? typeof vaultsType
      : typeof validatorsType;
  /**
   * Used for annotations
   */
  rawContent: string;
  path: string;
}[] {
  const folderPath = path.join("src", folder);

  return fs.readdirSync(folderPath).map((file) => {
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
