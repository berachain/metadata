/**
 * Validates existing coingeckoId values and discovers missing ones
 * by fetching the full CoinGecko coins list in a single request.
 *
 * 1. Validates: checks that every coingeckoId in mainnet.json exists on CoinGecko
 * 2. Discovers: finds tokens missing a coingeckoId that have a match by contract address
 *
 * Usage:
 *   pnpm tsx scripts/validateCoingeckoIds.ts
 *   pnpm tsx scripts/validateCoingeckoIds.ts --fix       # remove invalid IDs + write discovered ones
 *   pnpm tsx scripts/validateCoingeckoIds.ts --skip-lp   # skip LP/vault tokens for discovery
 *   pnpm tsx scripts/validateCoingeckoIds.ts --dry-run   # preview changes without writing
 *   pnpm tsx scripts/validateCoingeckoIds.ts --platform berachain  # default
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ------- config -------
const DEFAULT_PLATFORM = "berachain";
const COINGECKO_LIST_URL =
  "https://api.coingecko.com/api/v3/coins/list?include_platform=true";

// Patterns that indicate LP / wrapper tokens unlikely to be on CoinGecko
const LP_PATTERNS = [
  /^KODI /,
  /^STICKY /,
  /^IV-/,
  /^UNI-V2$/,
  /^d[A-Z]/, // Dolomite wrappers: dWBERA, dHONEY, drUSD, duniBTC
  /^yl/, // CIAN yield layer
  /^50s/, // weighted pool tokens
  /BULL ISH/,
  /HyperBERA/,
  /dgnBeraland/,
];

// ------- types -------
interface TokenExtensions {
  coingeckoId?: string;
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

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string>;
}

// ------- helpers -------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const platformIdx = args.indexOf("--platform");
const platform = platformIdx !== -1 ? args[platformIdx + 1] : DEFAULT_PLATFORM;
const fix = args.includes("--fix");
const dryRun = args.includes("--dry-run");
const skipLp = args.includes("--skip-lp");
const baseDir =
  args.find((a, i) => !a.startsWith("--") && i !== platformIdx + 1) ?? "";

function isLpToken(token: Token): boolean {
  return LP_PATTERNS.some(
    (p) => p.test(token.symbol) || p.test(token.name ?? ""),
  );
}

/**
 * Fetch the full CoinGecko coins list with platform contract addresses.
 * Retries on rate-limit (429).
 */
async function fetchCoinGeckoList(): Promise<CoinGeckoCoin[]> {
  console.log("Fetching full CoinGecko coins list (this may take a moment)…\n");

  const res = await fetch(COINGECKO_LIST_URL, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 429) {
    console.warn("  Rate limited — waiting 60s…");
    await sleep(60_000);
    return fetchCoinGeckoList();
  }

  if (!res.ok) {
    throw new Error(
      `CoinGecko /coins/list failed with HTTP ${res.status}: ${await res.text()}`,
    );
  }

  return (await res.json()) as CoinGeckoCoin[];
}

// ------- main -------
async function main() {
  const filePath = resolve(process.cwd(), baseDir, "src/tokens/mainnet.json");
  const raw = readFileSync(filePath, "utf-8");
  const tokenList = JSON.parse(raw) as TokenList;

  // Fetch CoinGecko data once
  const cgCoins = await fetchCoinGeckoList();

  const allCoinIds = new Set(cgCoins.map((c) => c.id));
  console.log(`  ${cgCoins.length} coins loaded from CoinGecko.`);

  // Build address → coin lookup for the target platform
  const cgByAddress = new Map<string, CoinGeckoCoin>();
  for (const coin of cgCoins) {
    const addr = coin.platforms?.[platform];
    if (addr) {
      cgByAddress.set(addr.toLowerCase(), coin);
    }
  }

  console.log(
    `  ${cgByAddress.size} coins have a contract address on platform "${platform}".\n`,
  );

  let dirty = false;

  // ═══════════════════════════════════════
  // STEP 1: Validate existing coingeckoIds
  // ═══════════════════════════════════════
  const withId = tokenList.tokens.filter((t) => t.extensions?.coingeckoId);
  const validExisting: typeof withId = [];
  const invalidExisting: { token: Token; id: string }[] = [];

  for (const token of withId) {
    const id = token.extensions!.coingeckoId!;
    if (allCoinIds.has(id)) {
      validExisting.push(token);
    } else {
      invalidExisting.push({ token, id });
    }
  }

  console.log("── Validate existing coingeckoIds ──");
  console.log(`  Valid:   ${validExisting.length} / ${withId.length}`);
  console.log(`  Invalid: ${invalidExisting.length}`);

  if (invalidExisting.length > 0) {
    console.log("\n  Invalid coingeckoId values:");
    for (const e of invalidExisting) {
      console.log(`    ✗  ${e.token.symbol.padEnd(16)} coingeckoId: "${e.id}"`);
    }

    if (fix && !dryRun) {
      for (const e of invalidExisting) {
        if (e.token.extensions) {
          delete e.token.extensions.coingeckoId;
          if (Object.keys(e.token.extensions).length === 0) {
            delete (e.token as Record<string, unknown>).extensions;
          }
        }
      }
      dirty = true;
      console.log(
        `\n  Removed ${invalidExisting.length} invalid coingeckoId(s).`,
      );
    } else if (fix && dryRun) {
      console.log(
        `\n  --dry-run: would remove ${invalidExisting.length} invalid coingeckoId(s).`,
      );
    }
  }

  // ═══════════════════════════════════════
  // STEP 2: Discover missing coingeckoIds
  // ═══════════════════════════════════════
  let candidates = tokenList.tokens.filter((t) => !t.extensions?.coingeckoId);

  if (skipLp) {
    const before = candidates.length;
    candidates = candidates.filter((t) => !isLpToken(t));
    console.log(
      `\n  Skipped ${before - candidates.length} LP/vault tokens for discovery.`,
    );
  }

  const discovered: Array<{
    symbol: string;
    address: string;
    coingeckoId: string;
  }> = [];
  const notFound: Array<{ symbol: string; address: string }> = [];

  for (const token of candidates) {
    const match = cgByAddress.get(token.address.toLowerCase());
    if (match) {
      discovered.push({
        symbol: token.symbol,
        address: token.address,
        coingeckoId: match.id,
      });
      if (!token.extensions) token.extensions = {};
      token.extensions.coingeckoId = match.id;
    } else {
      notFound.push({ symbol: token.symbol, address: token.address });
    }
  }

  console.log("\n── Discover missing coingeckoIds ──");
  console.log(`  Discovered: ${discovered.length} / ${candidates.length}`);
  console.log(`  Not found:  ${notFound.length}`);

  if (discovered.length > 0) {
    console.log("\n  New matches:");
    for (const d of discovered) {
      console.log(
        `    ✓  ${d.symbol.padEnd(24)} ${d.address}  →  "${d.coingeckoId}"`,
      );
    }

    if (fix && !dryRun) {
      dirty = true;
      console.log(`\n  Added ${discovered.length} new coingeckoId(s).`);
    } else if (!fix) {
      // Undo in-memory changes when not fixing
      for (const d of discovered) {
        const token = tokenList.tokens.find(
          (t) => t.address.toLowerCase() === d.address.toLowerCase(),
        );
        if (token?.extensions) {
          delete token.extensions.coingeckoId;
          if (Object.keys(token.extensions).length === 0) {
            delete (token as Record<string, unknown>).extensions;
          }
        }
      }
    } else {
      console.log(
        `\n  --dry-run: would add ${discovered.length} new coingeckoId(s).`,
      );
      // Undo in-memory changes for dry run
      for (const d of discovered) {
        const token = tokenList.tokens.find(
          (t) => t.address.toLowerCase() === d.address.toLowerCase(),
        );
        if (token?.extensions) {
          delete token.extensions.coingeckoId;
          if (Object.keys(token.extensions).length === 0) {
            delete (token as Record<string, unknown>).extensions;
          }
        }
      }
    }
  }

  if (notFound.length > 0) {
    console.log("\n  Not found on CoinGecko:");
    for (const t of notFound) {
      console.log(`    ✗  ${t.symbol.padEnd(24)} ${t.address}`);
    }
  }

  // ═══════════════════════════════════════
  // Write
  // ═══════════════════════════════════════
  if (dirty) {
    writeFileSync(filePath, `${JSON.stringify(tokenList, null, 2)}\n`);
    console.log("\n✓ mainnet.json updated.");
  }

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  Summary");
  console.log("══════════════════════════════════════════");
  console.log(`  Existing valid:    ${validExisting.length}`);
  console.log(`  Existing invalid:  ${invalidExisting.length}`);
  console.log(`  Newly discovered:  ${discovered.length}`);
  console.log(`  Not on CoinGecko:  ${notFound.length}`);
  console.log("══════════════════════════════════════════\n");

  const hasIssues = invalidExisting.length > 0 || discovered.length > 0;

  if (hasIssues && !fix) {
    console.log("Run with --fix to apply changes.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
