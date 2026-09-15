/**
 * Validates that every pythPriceId / beraPythPriceId in the mainnet token list
 * has been pushed to the Pyth contract on Berachain mainnet at least once.
 *
 * Usage:
 *   pnpm tsx scripts/validatePythPriceIds.ts
 *   pnpm tsx scripts/validatePythPriceIds.ts --fix   # remove invalid IDs from the file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import { clients } from "./utils";

const PYTH_CONTRACT_ADDRESS: Address =
  "0x2880aB155794e7179c9eE2e38200202908C17B43";

const PYTH_ABI = [
  {
    type: "function",
    name: "getPriceUnsafe",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "price",
        type: "tuple",
        components: [
          { name: "price", type: "int64" },
          { name: "conf", type: "uint64" },
          { name: "expo", type: "int32" },
          { name: "publishTime", type: "uint256" },
        ],
      },
    ],
  },
] as const;

interface TokenExtensions {
  pythPriceId?: string;
  beraPythPriceId?: string;
  [key: string]: unknown;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  extensions?: TokenExtensions;
  [key: string]: unknown;
}

interface TokenList {
  tokens: Token[];
  [key: string]: unknown;
}

const PYTH_ID_RE = /^0x[0-9a-f]{64}$/i;

function isValidFormat(id: string): id is Hex {
  return PYTH_ID_RE.test(id);
}

async function main() {
  const fix = process.argv.includes("--fix");
  const baseDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "";

  const filePath = resolve(process.cwd(), baseDir, "src/tokens/mainnet.json");
  const raw = readFileSync(filePath, "utf-8");
  const tokenList = JSON.parse(raw) as TokenList;

  const entries: { token: Token; field: string; id: string }[] = [];

  for (const token of tokenList.tokens) {
    for (const field of ["pythPriceId", "beraPythPriceId"] as const) {
      const id = token.extensions?.[field];
      if (id) {
        entries.push({ token, field, id });
      }
    }
  }

  if (entries.length === 0) {
    console.log("No Pyth price IDs found in mainnet.json — nothing to check.");
    return;
  }

  console.log(
    `Found ${entries.length} Pyth price ID(s) across ${tokenList.tokens.length} tokens.\n`,
  );

  const formatErrors: typeof entries = [];
  const validEntries: typeof entries = [];

  for (const entry of entries) {
    if (!isValidFormat(entry.id)) {
      formatErrors.push(entry);
    } else {
      validEntries.push(entry);
    }
  }

  if (formatErrors.length > 0) {
    console.log("Format errors (must be 0x + 64 hex chars):");
    for (const entry of formatErrors) {
      console.log(
        `  ✗  ${entry.token.symbol.padEnd(16)} ${entry.field}: ${entry.id}`,
      );
    }
    console.log();
  }

  const uniqueIds = [
    ...new Set(validEntries.map((entry) => entry.id.toLowerCase())),
  ];

  console.log(
    `Checking ${uniqueIds.length} unique ID(s) on Berachain mainnet…\n`,
  );

  const results = await clients.mainnet.multicall({
    allowFailure: true,
    contracts: uniqueIds.map((id) => ({
      address: PYTH_CONTRACT_ADDRESS,
      abi: PYTH_ABI,
      functionName: "getPriceUnsafe",
      args: [id as Hex],
    })),
  });

  const pushedIds = new Set(
    uniqueIds.filter((_id, index) => results[index]?.status === "success"),
  );

  const invalid: typeof entries = [];
  const valid: typeof entries = [];

  for (const entry of validEntries) {
    if (pushedIds.has(entry.id.toLowerCase())) {
      valid.push(entry);
    } else {
      invalid.push(entry);
    }
  }

  console.log("══════════════════════════════════════════");
  console.log(`Valid Pyth price IDs:      ${valid.length} / ${entries.length}`);
  console.log(`Invalid (format):          ${formatErrors.length}`);
  console.log(`Invalid (never on-chain):  ${invalid.length}`);
  console.log("══════════════════════════════════════════\n");

  if (invalid.length > 0) {
    console.log("Never pushed on Berachain mainnet:");
    for (const entry of invalid) {
      console.log(
        `  ✗  ${entry.token.symbol.padEnd(16)} ${entry.field}: ${entry.id}`,
      );
    }
  }

  const allBad = [...formatErrors, ...invalid];

  if (allBad.length > 0 && fix) {
    console.log("\n--fix: removing invalid Pyth price IDs from mainnet.json…");
    for (const entry of allBad) {
      if (entry.token.extensions) {
        delete entry.token.extensions[entry.field];
        if (Object.keys(entry.token.extensions).length === 0) {
          delete (entry.token as Record<string, unknown>).extensions;
        }
      }
    }
    writeFileSync(filePath, `${JSON.stringify(tokenList, null, 2)}\n`);
    console.log("Done — file updated.\n");
  }

  if (allBad.length > 0 && !fix) {
    console.log("\nRun with --fix to remove invalid IDs from mainnet.json.\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
