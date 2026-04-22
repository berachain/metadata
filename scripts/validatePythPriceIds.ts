/**
 * Validates that every pythPriceId / beraPythPriceId in the token lists
 * actually resolves to a live price feed on the Pyth Hermes API.
 *
 * Usage:
 *   pnpm tsx scripts/validatePythPriceIds.ts
 *   pnpm tsx scripts/validatePythPriceIds.ts --fix   # remove invalid IDs from the file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ------- config -------
const HERMES_BASE = "https://hermes.pyth.network";
// Hermes allows up to 50 IDs per batch request
const BATCH_SIZE = 50;
// Small delay between batches to be polite
const BATCH_DELAY_MS = 500;

// ------- types -------
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

interface PythParsedPriceFeed {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
  [key: string]: unknown;
}

interface PythLatestResponse {
  parsed?: PythParsedPriceFeed[];
}

// ------- helpers -------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PYTH_ID_RE = /^0x[0-9a-f]{64}$/i;

function isValidFormat(id: string): boolean {
  return PYTH_ID_RE.test(id);
}

/**
 * Batch-query Hermes for the latest price of a set of IDs.
 * Returns the set of IDs that resolved successfully.
 */
async function queryHermes(ids: string[]): Promise<Set<string>> {
  const params = new URLSearchParams();
  for (const id of ids) {
    params.append("ids[]", id);
  }

  const url = `${HERMES_BASE}/v2/updates/price/latest?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    // If the entire batch fails with 404 it could mean none of the IDs exist,
    // or Hermes may return a 400 when *any* ID is unknown.
    // We fall back to individual checks in that case.
    return new Set<string>();
  }

  const data = (await res.json()) as PythLatestResponse;
  const found = new Set<string>();
  for (const feed of data.parsed ?? []) {
    // Hermes returns IDs without the 0x prefix — normalise both sides
    found.add(`0x${feed.id.replace(/^0x/, "").toLowerCase()}`);
  }
  return found;
}

/**
 * Check a single ID against Hermes (used as fallback when batch fails).
 */
async function checkSingleId(id: string): Promise<boolean> {
  const params = new URLSearchParams();
  params.append("ids[]", id);

  const url = `${HERMES_BASE}/v2/updates/price/latest?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return false;

  const data = (await res.json()) as PythLatestResponse;
  return (data.parsed ?? []).length > 0;
}

// ------- main -------
async function main() {
  const fix = process.argv.includes("--fix");
  const baseDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "";

  const filePath = resolve(process.cwd(), baseDir, "src/tokens/mainnet.json");
  const raw = readFileSync(filePath, "utf-8");
  const tokenList = JSON.parse(raw) as TokenList;

  // Collect all (token, field, id) tuples
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

  // ---- Step 1: format validation ----
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
    for (const e of formatErrors) {
      console.log(`  ✗  ${e.token.symbol.padEnd(16)} ${e.field}: ${e.id}`);
    }
    console.log();
  }

  // ---- Step 2: liveness check against Hermes ----
  // De-duplicate IDs for efficient querying
  const uniqueIds = [...new Set(validEntries.map((e) => e.id.toLowerCase()))];
  const resolvedIds = new Set<string>();

  console.log(
    `Checking ${uniqueIds.length} unique ID(s) against Pyth Hermes…\n`,
  );

  // Batch requests
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueIds.length / BATCH_SIZE);

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} IDs)…  `,
    );

    const found = await queryHermes(batch);

    if (found.size > 0) {
      for (const id of found) resolvedIds.add(id);
      console.log(`${found.size} resolved`);
    } else {
      // Batch failed — fall back to individual checks
      console.log("batch failed, checking individually…");
      for (const id of batch) {
        const ok = await checkSingleId(id);
        if (ok) resolvedIds.add(id);
        await sleep(200);
      }
    }

    if (i + BATCH_SIZE < uniqueIds.length) await sleep(BATCH_DELAY_MS);
  }

  // ---- Step 3: report ----
  const invalid: typeof entries = [];
  const valid: typeof entries = [];

  for (const entry of validEntries) {
    if (resolvedIds.has(entry.id.toLowerCase())) {
      valid.push(entry);
    } else {
      invalid.push(entry);
    }
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`Valid Pyth price IDs:   ${valid.length} / ${entries.length}`);
  console.log(`Invalid (format):       ${formatErrors.length}`);
  console.log(`Invalid (not on Hermes): ${invalid.length}`);
  console.log("══════════════════════════════════════════\n");

  if (invalid.length > 0) {
    console.log("Not found on Hermes:");
    for (const e of invalid) {
      console.log(`  ✗  ${e.token.symbol.padEnd(16)} ${e.field}: ${e.id}`);
    }
  }

  const allBad = [...formatErrors, ...invalid];

  if (allBad.length > 0 && fix) {
    console.log("\n--fix: removing invalid Pyth price IDs from mainnet.json…");
    for (const e of allBad) {
      if (e.token.extensions) {
        delete e.token.extensions[e.field];
        // Clean up empty extensions object
        if (Object.keys(e.token.extensions).length === 0) {
          delete (e.token as Record<string, unknown>).extensions;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
