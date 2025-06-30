import { getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";
import type { VaultsFile } from "../../src/types/vaults";
import {
  CASE_SENSITIVE_ADDRESSES,
  REWARD_VAULT_FACTORIES,
} from "../_constants";
import { clients, formatAnnotation } from "../utils";

export async function validateVaults(
  errors: string[],
  file: {
    rawContent: string;
    path: string;
    chain: string;
    content: VaultsFile;
  },
) {
  const { rawContent, path, ...vaultMetadata } = file;
  const categories = vaultMetadata.content.categories;
  // Track duplicates
  const vaultAddresses = new Map<string, { name: string; index: number }>();
  const stakingTokenAddresses = new Map<
    string,
    { name: string; index: number }
  >();

  // First pass: check for duplicates
  vaultMetadata.content.vaults.forEach((vault, idx) => {
    const vaultAddress = vault.vaultAddress.toLowerCase();
    const stakingTokenAddress = vault.stakingTokenAddress.toLowerCase();

    if (vaultAddresses.has(vaultAddress)) {
      const existing = vaultAddresses.get(vaultAddress) ?? {
        name: "unknown",
        index: -1,
      };
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/vaults/${idx}/vaultAddress`,
          message: `Duplicate vault address found. ${vault.name} shares the same vault address as ${existing.name} (index ${existing.index})`,
          file: path,
        }),
      );
    } else {
      vaultAddresses.set(vaultAddress, { name: vault.name, index: idx });
    }

    if (stakingTokenAddresses.has(stakingTokenAddress)) {
      const existing = stakingTokenAddresses.get(stakingTokenAddress) ?? {
        name: "unknown",
        index: -1,
      };
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/vaults/${idx}/stakingTokenAddress`,
          message: `Duplicate staking token address found. ${vault.name} shares the same staking token as ${existing.name} (index ${existing.index})`,
          file: path,
        }),
      );
    } else {
      stakingTokenAddresses.set(stakingTokenAddress, {
        name: vault.name,
        index: idx,
      });
    }
  });

  // Second pass: validate on-chain data
  await Promise.all(
    vaultMetadata.content.vaults.map(async (vault, idx) => {
      if (vault.vaultAddress === zeroAddress) {
        // Bera Gas Token can't be read on-chain
        return;
      }

      if (!isAddress(vault.stakingTokenAddress, { strict: true })) {
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

      if (
        CASE_SENSITIVE_ADDRESSES &&
        stakingTokenAddress !== vault.stakingTokenAddress
      ) {
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

      if (CASE_SENSITIVE_ADDRESSES && onChainVault !== vault.vaultAddress) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/vaultAddress`,
            message: `${vault.name} vault address is wrongly formatted. Should be ${onChainVault}`,
            file: path,
          }),
        );
      }

      if (vault.category) {
        for (const category of vault.category) {
          if (!categories.some((c) => c.slug === category)) {
            errors.push(
              formatAnnotation({
                rawContent,
                xPath: `/vaults/${idx}/category`,
                message: `${category} is not a valid category. Should be one of ${categories.map((c) => c.slug).join(", ")}`,
                file: path,
              }),
            );
          }
        }
      }
    }),
  );
}
