import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv/dist/types";
import addFormats from "ajv-formats";
import tokenSchemas from "../schemas/tokens.schema.json" with { type: "json" };
import validatorSchemas from "../schemas/validators.schema.json" with {
  type: "json",
};
import vaultSchemas from "../schemas/vaults.schema.json" with { type: "json" };
import type { Protocol, Token, Validator, Vault } from "./types";

const ajv = new Ajv({
  validateSchema: false,
  allErrors: true,
}); // options can be passed, e.g. {allErrors: true}

addFormats(ajv);

const errors: [string, null | ErrorObject[]][] = [];

function checkDuplicates(
  data: {
    tokens?: Token[];
    vaults?: Vault[];
    validators?: Validator[];
    protocols?: Protocol[];
  },
  file: string,
  type: "token" | "validator" | "vault",
) {
  // Handle mainnet.json files
  if (data.tokens || data.vaults || data.validators || data.protocols) {
    // Check protocols array if it exists
    if (data.protocols) {
      const protocolNames = new Map<string, { name: string; index: number }>();
      const protocolUrls = new Map<string, { name: string; index: number }>();

      data.protocols.forEach(
        (protocol: { name?: string; url?: string }, idx: number) => {
          const name =
            typeof protocol.name === "string"
              ? protocol.name.toLowerCase()
              : "";
          const url =
            typeof protocol.url === "string" ? protocol.url.toLowerCase() : "";

          if (name && typeof name === "string") {
            if (protocolNames.has(name)) {
              const existing = protocolNames.get(name) ?? {
                name: "unknown",
                index: -1,
              };
              errors.push([
                file,
                [
                  {
                    instancePath: `/protocols/${idx}/name`,
                    schemaPath: "#/protocols/name",
                    keyword: "duplicate",
                    params: { duplicate: existing },
                    message: `Duplicate protocol name: ${name}`,
                  },
                ],
              ]);
            } else {
              protocolNames.set(name, {
                name: protocol.name ?? "",
                index: idx,
              });
            }
          }

          if (url && typeof url === "string") {
            if (protocolUrls.has(url)) {
              const existing = protocolUrls.get(url) ?? {
                name: "unknown",
                index: -1,
              };
              errors.push([
                file,
                [
                  {
                    instancePath: `/protocols/${idx}/url`,
                    schemaPath: "#/protocols/url",
                    keyword: "duplicate",
                    params: { duplicate: existing },
                    message: `Duplicate protocol url: ${url}`,
                  },
                ],
              ]);
            } else {
              protocolUrls.set(url, { name: protocol.name ?? "", index: idx });
            }
          }
        },
      );
    }

    // Check tokens/vaults/validators array
    const items = data.tokens || data.vaults || data.validators;
    if (items) {
      const addressMap = new Map<string, { name: string; index: number }>();
      const nameMap = new Map<string, { name: string; index: number }>();

      items.forEach(
        (
          item: { address?: string; vaultAddress?: string; name?: string },
          idx: number,
        ) => {
          const address =
            typeof item.address === "string"
              ? item.address.toLowerCase()
              : typeof item.vaultAddress === "string"
                ? item.vaultAddress.toLowerCase()
                : "";
          const name =
            typeof item.name === "string" ? item.name.toLowerCase() : "";

          if (name && typeof name === "string") {
            const key = `${name}-${address}`;
            if (nameMap.has(key)) {
              const existing = nameMap.get(key) ?? {
                name: "unknown",
                index: -1,
              };
              errors.push([
                file,
                [
                  {
                    instancePath: `/${type}s/${idx}/name`,
                    schemaPath: `#/${type}s/name`,
                    keyword: "duplicate",
                    params: { duplicate: existing },
                    message: `Duplicate ${type} name and address: ${name}`,
                  },
                ],
              ]);
            } else {
              nameMap.set(key, { name: item.name ?? "", index: idx });
            }
          }

          if (address && typeof address === "string") {
            if (addressMap.has(address)) {
              const existing = addressMap.get(address) ?? {
                name: "unknown",
                index: -1,
              };
              errors.push([
                file,
                [
                  {
                    instancePath: `/${type}s/${idx}/address`,
                    schemaPath: `#/${type}s/address`,
                    keyword: "duplicate",
                    params: { duplicate: existing },
                    message: `Duplicate ${type} address: ${address}`,
                  },
                ],
              ]);
            } else {
              addressMap.set(address, { name: item.name ?? "", index: idx });
            }
          }
        },
      );
    }
  }
}

function validate(
  schema: ValidateFunction,
  file: string,
  type: "token" | "validator" | "vault",
) {
  try {
    const data = JSON.parse(fs.readFileSync(file, { encoding: "utf-8" }));

    const valid = schema(data);

    if (!valid) {
      errors.push([file, schema.errors ?? null]);
    }

    // Check for duplicates
    checkDuplicates(data, file, type);
  } catch (error) {
    errors.push([file, error]);
  }
}

const validateValidator = ajv.compile(validatorSchemas);

const inputFolder = process.argv[2];

for (const file of fs.globSync(
  path.join(inputFolder ?? "", "src/validators/*.json"),
)) {
  validate(validateValidator, file, "validator");
}

const validateToken = ajv.compile(tokenSchemas);

for (const file of fs.globSync(
  path.join(inputFolder ?? "", "src/tokens/*.json"),
)) {
  validate(validateToken, file, "token");
}

const validateVault = ajv.compile(vaultSchemas);

for (const file of fs.globSync(
  path.join(inputFolder ?? "", "src/vaults/*.json"),
)) {
  validate(validateVault, file, "vault");
}

if (errors.length > 0) {
  console.error(`${errors.length} errors found in the JSON files:\n\n`);
  for (const error of errors) {
    console.error("Error in file", error[0]);

    for (const err of error[1] ?? []) {
      console.error(err.instancePath, err.message);
    }

    console.log("\n");
  }
  process.exit(1);
}
