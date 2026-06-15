import { spawn, type SpawnOptions } from "node:child_process";
import { readFile } from "node:fs/promises";

import type { Command, RunnerContext, ScriptExec, ScriptFs, ScriptLog } from "./script";

export const nodeFs: ScriptFs = {
	readText: (path) => readFile(path, "utf8"),
};

export const nodeExec: ScriptExec = (file, args, commandOptions = {}) =>
	new Promise((resolve, reject) => {
		const command: Command = { file, args, ...commandOptions };
		const options: SpawnOptions = {
			stdio: ["ignore", "pipe", "pipe"],
		};
		if (command.cwd !== undefined) {
			options.cwd = command.cwd;
		}
		if (command.env !== undefined) {
			options.env = { ...process.env, ...command.env };
		}
		const child = spawn(command.file, [...command.args], options);
		let stdout = "";
		let stderr = "";
		if (child.stdout === null || child.stderr === null) {
			child.kill();
			reject(new Error("nodeExec expected piped stdout and stderr"));
			return;
		}
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			const exitCode = code ?? 1;
			if (exitCode !== 0 && command.exitPolicy !== "any") {
				reject(new Error(`${command.file} exited ${exitCode}: ${stderr}${stdout}`));
				return;
			}
			resolve({ exitCode, stdout, stderr });
		});
	});

export const nodeLog: ScriptLog = {
	info: (message) => {
		process.stdout.write(`${message}\n`);
	},
	warning: (message) => {
		process.stderr.write(`${message}\n`);
	},
	group: async (name, run) => {
		process.stdout.write(`${name}\n`);
		return run();
	},
};

export const currentRunner = (): RunnerContext => {
	const uid = process.getuid?.();
	const gid = process.getgid?.();
	if (uid === undefined || gid === undefined) {
		throw new Error("POSIX uid/gid unavailable");
	}
	return { uidGid: `${uid}:${gid}` };
};
