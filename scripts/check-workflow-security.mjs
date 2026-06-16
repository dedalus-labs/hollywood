import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const roots = [".github/workflows", "ci"];
const extensions = new Set([".ts", ".yaml", ".yml"]);

const checks = [
	{
		name: "privileged pull request triggers",
		pattern: /\b(?:pull_request_target|workflow_run)\b/g,
	},
	{
		name: "workflow cache sharing",
		pattern: /\bactions\/cache@|^\s*cache:\s*["']?npm["']?/gm,
	},
	{
		name: "mutable action references",
		pattern: /uses:\s+[^#\n]*@(?![0-9a-f]{40}(?:\s|$))[^#\n\s]+/g,
	},
];

let failed = false;

for (const file of scanFiles(roots)) {
	const content = readFileSync(file, "utf8");
	for (const check of checks) {
		for (const match of content.matchAll(check.pattern)) {
			const line = content.slice(0, match.index).split("\n").length;
			const text = match[0].trim();
			console.error(`${file}:${line}: ${check.name}: ${text}`);
			failed = true;
		}
	}
}

if (failed) {
	process.exitCode = 1;
}

function* scanFiles(paths) {
	for (const path of paths) {
		if (!existsSync(path)) {
			continue;
		}

		for (const file of walk(path)) {
			if (extensions.has(extname(file))) {
				yield file;
			}
		}
	}
}

function* walk(path) {
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) {
			yield* walk(child);
			continue;
		}
		if (entry.isFile()) {
			yield child;
		}
	}
}
