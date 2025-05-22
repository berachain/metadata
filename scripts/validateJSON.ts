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
  const address = data.address?.toLowerCase();
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
