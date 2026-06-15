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

export const renderGeneratedFile = (file: GeneratedFile): RenderedGeneratedFile => ({
	sourcePath: file.sourcePath,
	path: file.path,
	content: generatedFileContent(file),
});

export const writeGeneratedFiles = async (
	files: readonly GeneratedFile[],
	options: WriteGeneratedFilesOptions,
): Promise<readonly GeneratedFileWriteResult[]> => {
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
