import {
  type Address,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";

import { clients, formatAnnotation } from "../utils";
import { ALLOWED_NAME_AND_SYMBOL_PATCHES } from "./_allowedTokenPatches";
import { CASE_SENSITIVE_ADDRESSES } from "../_constants";

export async function validateTokens(errors: string[], file) {
  const { rawContent, path, ...tokenMetadata } = file;

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
