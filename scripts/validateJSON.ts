import fs from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

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

const errors: [string, Error][] = [];

function validate(schema, file) {
	try {
		console.group("VALIDATING FILE:", file);
		const data = JSON.parse(fs.readFileSync(file, { encoding: "utf-8" }));

		console.log("DATA:", data);

		const valid = schema(data);

		console.log("VALID:", valid);
		if (!valid) {
			errors.push([file, valid.errors]);
		}
		console.groupEnd();
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
		console.error(error[1].message);
		console.log("\n");
	}
	process.exit(1);
}
