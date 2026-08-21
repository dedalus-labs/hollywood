import { command } from "../src/index";

export const checkoutAction =
	"actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10"; // v6.0.3

export const setupNodeAction =
	"actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"; // v6.4.0

export const setupPythonAction =
	"actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97"; // v7.0.0

export const createGitHubAppTokenAction =
	"actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1"; // v3.2.0

export const releasePleaseAction =
	"googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7"; // v5.0.0

export const uploadPagesArtifactAction =
	"actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b"; // v4.0.0

export const deployPagesAction =
	"actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128"; // v5.0.0

export const uploadArtifactAction =
	"actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"; // v4

export const dockerLoginAction =
	"docker/login-action@dbcb813823bdd20940b903addbd779551569679f"; // v4.6.0

export const dockerSetupBuildxAction =
	"docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f"; // v3

export const dockerSetupQemuAction =
	"docker/setup-qemu-action@c7c53464625b32c7a7e944ae62b3e17d2b600130"; // v3

export const dockerBuildPushAction =
	"docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8"; // v6

export const attestBuildProvenanceAction =
	"actions/attest-build-provenance@43d14bc2b83dec42d39ecae14e916627a18bb661"; // v3

export const installDependenciesCommand = command({ file: "npm", args: ["ci"] });
export const auditDependenciesCommand = command({
	file: "npm",
	args: ["audit", "--audit-level=high"],
});
export const verifyRegistrySignaturesCommand = command({
	file: "npm",
	args: ["audit", "signatures"],
});
export const lintCommand = command({ file: "npm", args: ["run", "lint"] });
export const typecheckCommand = command({ file: "npm", args: ["run", "typecheck"] });
export const testCommand = command({ file: "npm", args: ["test"] });
export const buildHollywoodCommand = command({ file: "npm", args: ["run", "build"] });
export const buildLocalActionsCommand = command({ file: "npm", args: ["run", "actions"] });
export const checkPackageContentsCommand = command({ file: "npm", args: ["run", "package"] });
export const checkHollywoodStateCommand = command({ file: "node", args: ["dist/cli.js", "check"] });
