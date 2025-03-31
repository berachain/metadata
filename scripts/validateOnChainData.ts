import {
  type Address,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import { clients, getMetadataInFolder } from "./_utils";
import { REWARD_VAULT_FACTORIES } from "./_constants";

const vaultsMetadataFiles = getMetadataInFolder("vaults");

const errors: string[] = [];

/**
 * This is a list of tokens that are allowed to does not match the on-chain name or symbol.
 * A Berachain member must manually add the token address to this list.
 *
 * DO NOT CHANGE THIS UNLESS EXPLICITLY ALLOWED BY A BERACHAIN MEMBER.
 */
const ALLOWED_NAME_AND_SYMBOL_PATCHES: Address[] = [
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

for (const vaultMetadata of vaultsMetadataFiles) {
  await Promise.all(
    vaultMetadata.content.vaults.map(async (vault, idx) => {
      const errorPrefix = `vaults/${vaultMetadata.chain}/${idx}:`;

      if (vault.vaultAddress === zeroAddress) {
        // Bera Token can't be read on-chain
        return;
      }

      if (!isAddress(vault.stakingTokenAddress)) {
        errors.push(
          `${errorPrefix} staking token ${vault.stakingTokenAddress} is not a valid address`,
        );
        return;
      }

      const stakingTokenAddress = getAddress(vault.stakingTokenAddress);

      if (stakingTokenAddress !== vault.stakingTokenAddress) {
        errors.push(
          `${errorPrefix} staking token ${vault.stakingTokenAddress} is wrongly formatted. Should be ${stakingTokenAddress}`,
        );
        return;
      }

      if (!isAddress(vault.vaultAddress)) {
        errors.push(
          `${errorPrefix} vault address ${vault.vaultAddress} is not a valid address`,
        );
        return;
      }

      const onChainVault = await clients[vaultMetadata.chain].readContract({
        address: REWARD_VAULT_FACTORIES[vaultMetadata.chain],
        abi: [
          {
            inputs: [
              {
                internalType: "address",
                name: "stakingToken",
                type: "address",
              },
            ],
            name: "getVault",
            outputs: [
              {
                internalType: "address",
                name: "vault",
                type: "address",
              },
            ],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "getVault",
        args: [stakingTokenAddress],
      });

      if (onChainVault === zeroAddress) {
        errors.push(
          `${errorPrefix} no vault found for provided staking token ${vault.stakingTokenAddress} on ${vault.name}`,
        );
        return;
      }

      if (!isAddressEqual(onChainVault, vault.vaultAddress)) {
        errors.push(
          `${errorPrefix} vault address for token ${vault.name} is wrongly formatted. Should be ${onChainVault}`,
        );
      }
    }),
  );
}

const tokenMetadataFiles = getMetadataInFolder("tokens");

for (const tokenMetadata of tokenMetadataFiles) {
  const publicClient = clients[tokenMetadata.chain];

  await Promise.all(
    tokenMetadata.content.tokens.map(async (token, idx) => {
      const errorPrefix = `tokens/${idx}:`;
      const tokenAddress = token.address;

      if (tokenAddress === zeroAddress) {
        return;
      }

      if (!isAddress(tokenAddress)) {
        errors.push(
          `${errorPrefix} token ${tokenAddress} for ${tokenMetadata.chain} is not a valid address`,
        );
        return;
      }

      const formattedTokenAddress = getAddress(tokenAddress);

      if (formattedTokenAddress !== tokenAddress) {
        errors.push(
          `${errorPrefix} token ${tokenAddress} for ${tokenMetadata.chain} is wrongly formatted. Should be ${formattedTokenAddress}`,
        );
        return;
      }

      const [onChainName, onChainSymbol, onChainDecimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "name",
          args: [],
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
          args: [],
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
          args: [],
        }),
      ]);

      if (
        onChainName !== token.name &&
        !ALLOWED_NAME_AND_SYMBOL_PATCHES.includes(tokenAddress)
      ) {
        errors.push(
          `${errorPrefix} token ${tokenAddress} on ${tokenMetadata.chain} has different name. Should be ${onChainName} is ${token.name}`,
        );
      }

      if (
        onChainSymbol !== token.symbol &&
        !ALLOWED_NAME_AND_SYMBOL_PATCHES.includes(tokenAddress)
      ) {
        errors.push(
          `${errorPrefix} token ${tokenAddress} on ${tokenMetadata.chain} has different symbol. Should be ${onChainSymbol} is ${token.symbol}`,
        );
      }

      if (onChainDecimals !== token.decimals) {
        errors.push(
          `${errorPrefix} token ${tokenAddress} on ${tokenMetadata.chain} has different decimals. Should be ${onChainDecimals} is ${token.decimals}`,
        );
      }
    }),
  );
}

if (errors.length > 0) {
  console.log("Errors found:");
  for (const error of errors) {
    console.error(error);
  }

  process.exit(1);
}
