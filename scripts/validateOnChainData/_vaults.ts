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
  warnings: string[] = [],
) {
  const { rawContent, path, ...vaultMetadata } = file;
  const categories = vaultMetadata.content.categories;
  const protocols = vaultMetadata.content.protocols;

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
        warnings.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/stakingTokenAddress`,
            message: `${vault.name} staking token is wrongly formatted. Should be ${stakingTokenAddress}`,
            file: path,
            level: "warning",
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

      if (vault.protocol && !protocols.some((p) => p.name === vault.protocol)) {
        errors.push(
          formatAnnotation({
            rawContent,
            xPath: `/vaults/${idx}/protocol`,
            message: `${vault.protocol} is not a valid protocol. Please add it to the list at the top of this file if it's a new protocol.`,
            file: path,
          }),
        );
      }

      if (vault.categories) {
        for (const categoryEntry of vault.categories) {
          const [category, subcategory, anythingElse] =
            categoryEntry.split("/");

          if (anythingElse) {
            errors.push(
              formatAnnotation({
                rawContent,
                xPath: `/vaults/${idx}/categories`,
                message: `${categoryEntry} is not a valid category. Categories should be in the format "category/subcategory"`,
                file: path,
              }),
            );
          }

          const categoryDefinition = categories.find(
            (c) => c.slug === category,
          );

          if (!categoryDefinition) {
            errors.push(
              formatAnnotation({
                rawContent,
                xPath: `/vaults/${idx}/categories`,
                message: `${category} is not a valid category. Should be one of ${categories.map((c) => c.slug).join(", ")}`,
                file: path,
              }),
            );
          }

          if (subcategory) {
            if (
              !categoryDefinition?.subcategories?.some(
                (c) => c.slug === subcategory,
              )
            ) {
              errors.push(
                formatAnnotation({
                  rawContent,
                  xPath: `/vaults/${idx}/categories`,
                  message: `${subcategory} is not a valid subcategory of ${category}. Should be one of: ${categoryDefinition?.subcategories?.map((c) => c.slug).join(", ")}`,
                  file: path,
                }),
              );
            }
          }
        }
      }
    }),
  );

  vaultMetadata.content.protocols.forEach((protocol, idx) => {
    const isPlatform = protocol.tags?.includes("platform");
    const vaultWithProtocol = vaultMetadata.content.vaults.find(
      (vault) => vault.protocol === protocol.name,
    );

    if (isPlatform && !vaultWithProtocol) {
      // If the protocol is marked as platform, it should have at least one active vault
      // Otherwise, it should not be marked as platform
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/protocols/${idx}/tags`,
          message: `${protocol.name} protocol has no active vaults, but is marked as platform in the tags.`,
          file: path,
        }),
      );
    } else if (
      !isPlatform &&
      vaultMetadata.content.vaults.some(
        (vault) => vault.protocol === protocol.name,
      )
    ) {
      // If the protocol is not marked as platform, it should not have any active vaults
      // Otherwise, it should be marked as platform
      errors.push(
        formatAnnotation({
          rawContent,
          xPath: `/protocols/${idx}/${protocol.tags !== undefined ? "tags" : "name"}`,
          message: `${protocol.name} protocol has active vaults, but is not marked as platform in the tags.`,
          file: path,
        }),
      );
    }
  });
}
