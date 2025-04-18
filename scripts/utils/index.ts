import { http, type PublicClient, createPublicClient } from "viem";
import { berachain, berachainBepolia } from "viem/chains";
import type { ValidChainName } from "../_constants";

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

export * from "./_formatAnnotation";
export * from "./_getMetadataInFolder";
export * from "./_isValidChainName";
