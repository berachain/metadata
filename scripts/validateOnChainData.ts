import {
  type Address,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import { REWARD_VAULT_FACTORIES } from "./_constants";
import { clients, formatAnnotation, getMetadataInFolder } from "./_utils";

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

for (const { rawContent, path, ...vaultMetadata } of vaultsMetadataFiles) {
  await Promise.all(
    vaultMetadata.content.vaults.map(async (vault, idx) => {
      if (vault.vaultAddress === zeroAddress) {
        // Bera Token can't be read on-chain
        return;
      }

      if (!isAddress(vault.stakingTokenAddress)) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/stakingTokenAddress`,
            message: `${vault.name} staking token is not a valid address`,
            file: path,
          }),
        );
        return;
      }

      const stakingTokenAddress = getAddress(vault.stakingTokenAddress);

      if (stakingTokenAddress !== vault.stakingTokenAddress) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/stakingTokenAddress`,
            message: `${vault.name} staking token is wrongly formatted. Should be ${stakingTokenAddress}`,
            file: path,
          }),
        );
        return;
      }

      if (!isAddress(vault.vaultAddress)) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/vaultAddress`,
            message: `${vault.name} vault address is not a valid address`,
            file: path,
          }),
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
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/vaultAddress`,
            message: ` ${vault.name} staking token has no vault deployed on chain.`,
            file: path,
          }),
        );
        return;
      }

      if (!isAddressEqual(onChainVault, vault.vaultAddress)) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/vaultAddress`,
            message: `${vault.name} vault address does not match on-chain address for the staking token. Should be ${onChainVault}`,
            file: path,
          }),
        );
        return;
      }

      if (onChainVault !== vault.vaultAddress) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/vaultAddress`,
            message: `${vault.name} vault address is wrongly formatted. Should be ${onChainVault}`,
            file: path,
          }),
        );
      }
    }),
  );
}

const tokenMetadataFiles = getMetadataInFolder("tokens");

for (const { rawContent, path, ...tokenMetadata } of tokenMetadataFiles) {
  const publicClient = clients[tokenMetadata.chain];

  await Promise.all(
    tokenMetadata.content.tokens.map(async (token, idx) => {
      const tokenAddress = token.address;

      if (tokenAddress === zeroAddress) {
        return;
      }

      if (!isAddress(tokenAddress)) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/tokens/${idx}/address`,
            message: `${token.name} address is not a valid address`,
            file: path,
          }),
        );
        return;
      }

      const formattedTokenAddress = getAddress(tokenAddress);

      if (formattedTokenAddress !== tokenAddress) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/tokens/${idx}/address`,
            message: `${token.name} address is wrongly formatted. Should be ${formattedTokenAddress}`,
            file: path,
          }),
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
          formatAnnotation({
            rawContent,
            xPath: `/tokens/${idx}/name`,
            message: `Token ${token.name} has different name on ${tokenMetadata.chain} . Should be ${onChainName} is ${token.name}`,
            file: path,
          }),
        );
      }

      if (
        onChainSymbol !== token.symbol &&
        !ALLOWED_NAME_AND_SYMBOL_PATCHES.includes(tokenAddress)
      ) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/tokens/${idx}/symbol`,
            message: `Token ${token.name} has different symbol on ${tokenMetadata.chain}. Should be ${onChainSymbol}`,
            file: path,
          }),
        );
      }

      if (onChainDecimals !== token.decimals) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/tokens/${idx}/decimals`,
            message: `Token ${token.name}  has different decimals on ${tokenMetadata.chain}. Should be ${onChainDecimals}`,
            file: path,
          }),
        );
      }
    }),
  );
}

if (errors.length > 0) {
  console.log("Errors found:");
  for (const error of errors) {
    console.error("\x1b[31m%s\x1b[0m", "Error", error);
  }

  process.exit(1);
}
