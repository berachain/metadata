import { getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";
import {
  CASE_SENSITIVE_ADDRESSES,
  REWARD_VAULT_FACTORIES,
} from "../_constants";
import { clients, formatAnnotation } from "../utils";

export async function validateVaults(errors: string[], file) {
  const { rawContent, path, ...vaultMetadata } = file;
  await Promise.all(
    vaultMetadata.content.vaults.map(async (vault, idx) => {
      if (vault.vaultAddress === zeroAddress) {
        // Bera Gas Token can't be read on-chain
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
    }),
  );
}
