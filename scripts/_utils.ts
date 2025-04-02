import fs from "node:fs";
import path from "node:path";
import core from "@actions/core";
import { type Node, findNodeAtLocation, parseTree } from "jsonc-parser";
import { http, type PublicClient, createPublicClient } from "viem";
import { berachain, berachainBepolia } from "viem/chains";
import type tokensType from "../src/tokens/mainnet.json";
import type validatorsType from "../src/validators/mainnet.json";
import type vaultsType from "../src/vaults/mainnet.json";
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

function offsetToLineCol(text: string, offset: number) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
export function formatAnnotation({
  rawContent,
  xPath,
  message,
  file,
  level = "error",
}: {
  rawContent: string;
  xPath: string;
  message: string;
  file: string;
  level?: "error" | "warning";
}): string {
  // Rimuove il BOM se presente
  const contentWithoutBOM = rawContent.replace(/^\uFEFF/, "");
  // Normalizza i caratteri di fine riga a '\n'
  const normalizedContent = contentWithoutBOM.replace(/\r\n/g, "\n");

  const tree = parseTree(normalizedContent);
  if (!tree) {
    throw new Error("Failed to parse tree");
  }
  const parts = xPath
    .replace(/^\//, "")
    .split("/")
    .map((p) => (/^\d+$/.test(p) ? +p : p));

  const node = findNodeAtLocation(tree, parts);

  if (node) {
    const { line, col } = offsetToLineCol(normalizedContent, node.offset);

    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      core.error(message, {
        file,
        startLine: line,
        startColumn: col,
      });
      // return `::${level} file=${file},line=${line},col=${col}::${message}`;
    } else {
      return `${file}:${line}:${col} ${message}`;
    }
  }

  return message;
}
