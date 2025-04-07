import type { Address } from "viem";

/**
 * This is a list of tokens that are allowed to does not match the on-chain name or symbol.
 * A Berachain member must manually add the token address to this list.
 *
 * DO NOT CHANGE THIS UNLESS EXPLICITLY ALLOWED BY A BERACHAIN MEMBER.
 */
export const ALLOWED_NAME_AND_SYMBOL_PATCHES: Address[] = [
  "0x6969696969696969696969696969696969696969",

  /**
   * ==============
   * MAINNET
   * ==============
   */

  // USDT
  "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  // WBTC
  "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  // iBERA
  "0x9b6761bf2397Bb5a6624a856cC84A3A14Dcd3fe5",
  // iBGT
  "0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b",

  /**
   * ==============
   * BEPOLIA
   * ==============
   */

  // Bepolia Incentive Tokens
  "0xf0063bac3Bd6a88049dDE2422365aaFd87D49054",
  "0x1DB94dA7E7Af8529878053559552CFA8797f447B",
  "0xF93CD4C23398A827B70A5994C21C5e8023394dad",
  "0xFDD764D4Afd1F378B1bA1E56f477C4C4585B15D8",
];
