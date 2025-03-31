import fs from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import tokenSchemas from "../schemas/tokens.schema.json" with { type: "json" };
import validatorSchemas from "../schemas/validators.schema.json" with {
	type: "json",
};
import vaultSchemas from "../schemas/vaults.schema.json" with { type: "json" };
import type {
	DataValidateFunction,
	ErrorObject,
	ValidateFunction,
} from "ajv/dist/types";

const ajv = new Ajv({
	validateSchema: false,
	allErrors: true,
}); // options can be passed, e.g. {allErrors: true}

addFormats(ajv);

const errors: [string, null | ErrorObject[]][] = [];

function validate(schema: ValidateFunction, file) {
	try {
		const data = JSON.parse(fs.readFileSync(file, { encoding: "utf-8" }));

		const valid = schema(data);

		if (!valid) {
			console.error("VALIDATION ERROR:", schema.errors);
			errors.push([file, schema.errors ?? null]);
		}
	} catch (error) {
		errors.push([file, error]);
	}
}

const validateValidator = ajv.compile(validatorSchemas);

for (const file of fs.globSync("src/validators/*.json")) {
	validate(validateValidator, file);
}

const validateToken = ajv.compile(tokenSchemas);

for (const file of fs.globSync("src/tokens/*.json")) {
	validate(validateToken, file);
}

const validateVault = ajv.compile(vaultSchemas);

for (const file of fs.globSync("src/vaults/*.json")) {
	validate(validateVault, file);
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
