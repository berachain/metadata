import fs from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import path from "node:path";
import type { ErrorObject, ValidateFunction } from "ajv/dist/types";
import tokenSchemas from "../schemas/tokens.schema.json" with { type: "json" };
import validatorSchemas from "../schemas/validators.schema.json" with {
  type: "json",
};
import vaultSchemas from "../schemas/vaults.schema.json" with { type: "json" };

const ajv = new Ajv({
  validateSchema: false,
  allErrors: true,
}); // options can be passed, e.g. {allErrors: true}

addFormats(ajv);

const errors: [string, null | ErrorObject[]][] = [];
const addressMap = new Map<string, string[]>();
const nameMap = new Map<string, string[]>();

function checkDuplicates(data: any, file: string, type: 'token' | 'validator' | 'vault') {
  // Handle mainnet.json files
  if (data.tokens || data.vaults || data.validators) {
    const items = data.tokens || data.vaults || data.validators;
    const addressMap = new Map<string, { name: string, index: number }>();
    const nameMap = new Map<string, { name: string, index: number }>();

    items.forEach((item: any, idx: number) => {
      const address = item.address?.toLowerCase() || item.vaultAddress?.toLowerCase();
      const name = item.name?.toLowerCase();

      if (address) {
        if (addressMap.has(address)) {
          const existing = addressMap.get(address)!;
          errors.push([file, [{
            instancePath: `/${type}s/${idx}/address`,
            message: `Duplicate address found. ${item.name} shares the same address as ${existing.name} (index ${existing.index})`,
            keyword: 'duplicate',
            schemaPath: '#/properties/address',
            params: { duplicate: address },
            severity: 'error'
          } as ErrorObject]]);
        } else {
          addressMap.set(address, { name: item.name, index: idx });
        }
      }

      if (name) {
        if (nameMap.has(name)) {
          const existing = nameMap.get(name)!;
          errors.push([file, [{
            instancePath: `/${type}s/${idx}/name`,
            message: `Duplicate name found. ${item.name} shares the same name as ${existing.name} (index ${existing.index})`,
            keyword: 'duplicate',
            schemaPath: '#/properties/name',
            params: { duplicate: name },
            severity: 'error'
          } as ErrorObject]]);
        } else {
          nameMap.set(name, { name: item.name, index: idx });
        }
      }
    });
    return;
  }

  // Handle individual JSON files
  const address = data.address?.toLowerCase() || data.vaultAddress?.toLowerCase();
  const name = data.name?.toLowerCase();

  if (address) {
    const existingFiles = addressMap.get(address) || [];
    if (existingFiles.length > 0) {
      errors.push([file, [{
        instancePath: '/address',
        message: `Duplicate address found. Also exists in: ${existingFiles.join(', ')}`,
        keyword: 'duplicate',
        schemaPath: '#/properties/address',
        params: { duplicate: address },
        severity: 'error'
      } as ErrorObject]]);
    }
    addressMap.set(address, [...existingFiles, file]);
  }

  if (name) {
    const existingFiles = nameMap.get(name) || [];
    if (existingFiles.length > 0) {
      errors.push([file, [{
        instancePath: '/name',
        message: `Duplicate name found. Also exists in: ${existingFiles.join(', ')}`,
        keyword: 'duplicate',
        schemaPath: '#/properties/name',
        params: { duplicate: name },
        severity: 'error'
      } as ErrorObject]]);
    }
    nameMap.set(name, [...existingFiles, file]);
  }
}

function validate(schema: ValidateFunction, file: string, type: 'token' | 'validator' | 'vault') {
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
  validate(validateValidator, file, 'validator');
}

const validateToken = ajv.compile(tokenSchemas);

for (const file of fs.globSync(
  path.join(inputFolder ?? "", "src/tokens/*.json"),
)) {
  validate(validateToken, file, 'token');
}

const validateVault = ajv.compile(vaultSchemas);

for (const file of fs.globSync(
  path.join(inputFolder ?? "", "src/vaults/*.json"),
)) {
  validate(validateVault, file, 'vault');
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
