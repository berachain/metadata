import { VALID_CHAIN_NAMES, type ValidChainName } from "../_constants";

export function isValidChainName(
  chainName: string,
): chainName is ValidChainName {
  return VALID_CHAIN_NAMES.includes(chainName as ValidChainName);
}
