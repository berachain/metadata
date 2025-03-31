import fs from "node:fs";
import path from "node:path";
import type tokensType from "../src/tokens/mainnet.json";
import type validatorsType from "../src/validators/mainnet.json";
import type vaultsType from "../src/vaults/mainnet.json";

import { http, type PublicClient, createPublicClient } from "viem";
import { berachain, berachainBepolia } from "viem/chains";
import { VALID_CHAIN_NAMES, type ValidChainName } from "./_constants";

const mainnetClient = createPublicClient({
  chain: berachain,
  transport: http(),
  batch: {
    multicall: {
      wait: 10,
    },
  },
});

const bepoliaClient = createPublicClient({
  chain: berachainBepolia,
  transport: http(),
  batch: {
    multicall: {
      wait: 10,
    },
  },
});

export const clients: Record<ValidChainName, PublicClient> = {
  mainnet: mainnetClient,
  bepolia: bepoliaClient,
};

export function isValidChainName(
  chainName: string,
): chainName is ValidChainName {
  return VALID_CHAIN_NAMES.includes(chainName as ValidChainName);
}

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
}[] {
  const folderPath = path.join("src", folder);

  return fs.readdirSync(folderPath).map((file) => {
    const chain = file.split(".json")[0];

    if (!isValidChainName(chain)) {
      throw new Error(`Invalid chain name: ${chain}`);
    }

    const content = JSON.parse(
      fs.readFileSync(path.join(folderPath, file), "utf8"),
    );
    return { chain, content };
  });
}
