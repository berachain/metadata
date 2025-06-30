import { erc20Abi, getAddress, isAddress, zeroAddress } from "viem";

import type { TokensFile } from "../../src/types/tokens";
import { CASE_SENSITIVE_ADDRESSES } from "../_constants";
import { clients, formatAnnotation } from "../utils";
import { ALLOWED_NAME_AND_SYMBOL_PATCHES } from "./_allowedTokenPatches";

export async function validateTokens(
  errors: string[],
  file: {
    rawContent: string;
    path: string;
    chain: string;
    content: TokensFile;
  },
) {
  const { rawContent, path, ...tokenMetadata } = file;

  const publicClient = clients[tokenMetadata.chain];

  // Track duplicates
  const tokenAddresses = new Map<string, { name: string; index: number }>();
  const tokenSymbols = new Map<string, { name: string; index: number }>();

  // First pass: check for duplicates
  tokenMetadata.content.tokens.forEach((token, idx) => {
    const tokenAddress = token.address.toLowerCase();
    const tokenSymbol = token.symbol.toLowerCase();

    if (tokenAddresses.has(tokenAddress)) {
      const existing = tokenAddresses.get(tokenAddress) ?? {
        name: "unknown",
        index: -1,
      };
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/tokens/${idx}/address`,
          message: `Duplicate token address found. ${token.name} shares the same address as ${existing.name} (index ${existing.index})`,
          file: path,
        }),
      );
    } else {
      tokenAddresses.set(tokenAddress, { name: token.name, index: idx });
    }

    if (tokenSymbols.has(tokenSymbol)) {
      const existing = tokenSymbols.get(tokenSymbol) ?? {
        name: "unknown",
        index: -1,
      };
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/tokens/${idx}/symbol`,
          message: `Duplicate token symbol found. ${token.name} shares the same symbol as ${existing.name} (index ${existing.index})`,
          file: path,
        }),
      );
    } else {
      tokenSymbols.set(tokenSymbol, { name: token.name, index: idx });
    }
  });

  // Second pass: validate on-chain data
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

      if (CASE_SENSITIVE_ADDRESSES && formattedTokenAddress !== tokenAddress) {
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
            message: `Token ${token.name} has different name on ${tokenMetadata.chain}. Should be ${onChainName} is ${token.name}`,
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
