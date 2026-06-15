import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTION_ROOT } from "@actions/workflow-parser/actions/action-constants";
import { JSONObjectReader } from "@actions/workflow-parser/templates/json-object-reader";
import {
	TemplateContext,
	TemplateValidationErrors,
} from "@actions/workflow-parser/templates/template-context";
import * as templateReader from "@actions/workflow-parser/templates/template-reader";
import { TemplateSchema } from "@actions/workflow-parser/templates/schema/index";
import { NoOperationTraceWriter } from "@actions/workflow-parser/templates/trace-writer";
import { WORKFLOW_ROOT } from "@actions/workflow-parser/workflows/workflow-constants";
import { YamlObjectReader } from "@actions/workflow-parser/workflows/yaml-object-reader";

export type GitHubYamlFile = Readonly<{
	name: string;
	content: string;
}>;

export type GitHubYamlValidationError = Readonly<{
	message: string;
}>;

export type GitHubYamlValidation =
	| Readonly<{ status: "valid"; errors: readonly [] }>
	| Readonly<{
			status: "invalid";
			errors: readonly [GitHubYamlValidationError, ...GitHubYamlValidationError[]];
	  }>;

export const validateWorkflowContent = (file: GitHubYamlFile): GitHubYamlValidation =>
	validateContent(file, workflowSchema(), WORKFLOW_ROOT);

export const validateActionMetadataContent = (file: GitHubYamlFile): GitHubYamlValidation =>
	validateContent(file, actionSchema(), ACTION_ROOT);

export const assertValidWorkflowContent = (file: GitHubYamlFile): void =>
	assertValid("GitHub workflow YAML", validateWorkflowContent(file));

export const assertValidActionMetadataContent = (file: GitHubYamlFile): void =>
	assertValid("GitHub action metadata YAML", validateActionMetadataContent(file));

let workflowSchemaCache: TemplateSchema | null = null;
let actionSchemaCache: TemplateSchema | null = null;

const validateContent = (
	file: GitHubYamlFile,
	schema: TemplateSchema,
	rootDefinition: string,
): GitHubYamlValidation => {
	const context = new TemplateContext(
		new TemplateValidationErrors(),
		schema,
		new NoOperationTraceWriter(),
	);
	const fileId = context.getFileId(file.name);
	const reader = new YamlObjectReader(fileId, file.content);
	for (const error of reader.errors) {
		context.error(fileId, error.message, error.range);
	}
	if (reader.errors.length === 0) {
		templateReader.readTemplate(context, rootDefinition, reader, fileId);
	}
	return validationFrom(
		context.errors.getErrors().map((error) => ({
			message: error.message,
		})),
	);
};

const assertValid = (label: string, validation: GitHubYamlValidation): void => {
	if (validation.status === "valid") {
		return;
	}
	throw new Error(
		`${label} is invalid:\n${validation.errors.map((error) => `- ${error.message}`).join("\n")}`,
	);
};

const validationFrom = (errors: readonly GitHubYamlValidationError[]): GitHubYamlValidation => {
	if (errors.length === 0) {
		return { status: "valid", errors: [] };
	}
	return {
		status: "invalid",
		errors: errors as readonly [GitHubYamlValidationError, ...GitHubYamlValidationError[]],
	};
};

const workflowSchema = (): TemplateSchema => {
	workflowSchemaCache ??= loadSchema("workflow-v1.0.min.json");
	return workflowSchemaCache;
};

const actionSchema = (): TemplateSchema => {
	actionSchemaCache ??= loadSchema("action-v1.0.min.json");
	return actionSchemaCache;
};

const loadSchema = (schemaFileName: string): TemplateSchema => {
	const json = readFileSync(join(workflowParserDistDir(), schemaFileName), "utf8");
	return TemplateSchema.load(new JSONObjectReader(undefined, json));
};

const workflowParserDistDir = (): string =>
	dirname(
		dirname(
			fileURLToPath(import.meta.resolve("@actions/workflow-parser/workflows/workflow-constants")),
		),
	);
