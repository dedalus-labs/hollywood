import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { GitHubActionEntrypointFile, GitHubActionFile, GitHubWorkflowFile } from "./generate";
import { renderActionFile, renderWorkflowFile } from "./generate";

export type GeneratedFile = GitHubActionFile | GitHubActionEntrypointFile | GitHubWorkflowFile;

export type RenderedGeneratedFile = Readonly<{
	sourcePath: string;
	path: string;
	content: string;
}>;

export type GeneratedFileWriteStatus = "created" | "unchanged" | "updated";

export type GeneratedFileWriteResult = Readonly<{
	sourcePath: string;
	path: string;
	outputPath: string;
	status: GeneratedFileWriteStatus;
}>;

export type WriteGeneratedFilesOptions = Readonly<{
	outputDir: string;
}>;

export class GeneratedFilePathCollisionError extends Error {
	readonly paths: readonly string[];
	readonly sources: readonly string[];

	constructor(first: GeneratedFile, second: GeneratedFile) {
		const paths = [first.path, second.path];
		const sources = [generatedFileSource(first), generatedFileSource(second)];
		super(`generated file path collision: ${paths.join(" and ")} from ${sources.join(" and ")}`);
		this.name = "GeneratedFilePathCollisionError";
		this.paths = paths;
		this.sources = sources;
	}
}

export const renderGeneratedFile = (file: GeneratedFile): RenderedGeneratedFile => ({
	sourcePath: file.sourcePath,
	path: file.path,
	content: generatedFileContent(file),
});

export const writeGeneratedFiles = async (
	files: readonly GeneratedFile[],
	options: WriteGeneratedFilesOptions,
): Promise<readonly GeneratedFileWriteResult[]> => {
	assertUniqueGeneratedPaths(files);
	const results: GeneratedFileWriteResult[] = [];
	for (const file of files) {
		const rendered = renderGeneratedFile(file);
		const outputPath = resolveOutputPath(options.outputDir, rendered.path);
		const status = await writeGeneratedFile(outputPath, rendered.content);
		results.push({
			sourcePath: rendered.sourcePath,
			path: rendered.path,
			outputPath,
			status,
		});
	}
	return results;
};

const generatedFileSource = (file: GeneratedFile): string =>
	"sourceExport" in file && file.sourceExport !== undefined
		? `${file.sourcePath}#${file.sourceExport}`
		: file.sourcePath;

const assertUniqueGeneratedPaths = (files: readonly GeneratedFile[]): void => {
	const paths = new Map<string, GeneratedFile>();
	for (const file of files) {
		const key = file.path.normalize("NFC").toLowerCase();
		const existing = paths.get(key);
		if (existing !== undefined) {
			throw new GeneratedFilePathCollisionError(existing, file);
		}
		paths.set(key, file);
	}
};

const generatedFileContent = (file: GeneratedFile): string => {
	if ("content" in file) {
		return file.content;
	}
	if ("metadata" in file) {
		return renderActionFile(file);
	}
	return renderWorkflowFile(file);
};

const writeGeneratedFile = async (
	outputPath: string,
	content: string,
): Promise<GeneratedFileWriteStatus> => {
	const existing = await readExisting(outputPath);
	if (existing === content) {
		return "unchanged";
	}
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, content);
	return existing === null ? "created" : "updated";
};

const readExisting = async (path: string): Promise<string | null> => {
	try {
		return await readFile(path, "utf8");
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
};

const resolveOutputPath = (outputDir: string, path: string): string => {
	if (isAbsolute(path)) {
		throw new Error(`generated file path escapes outputDir: ${path}`);
	}
	const root = resolve(outputDir);
	const outputPath = resolve(root, path);
	const relativePath = relative(root, outputPath);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new Error(`generated file path escapes outputDir: ${path}`);
	}
	return outputPath;
};
