import { action, booleanInput, pathInput, stringInput, stringOutput } from "@dedalus-labs/hollywood";

export const publishImage = action({
	name: "publish-container-image",
	description: "Build and publish a container image without embedding shell in workflow YAML.",
	localActionPath: "publish-container-image",
	inputs: {
		image: stringInput({ description: "Container image name, including registry." }),
		tag: stringInput({ description: "Container image tag." }),
		context: pathInput({ description: "Build context path.", default: "." }),
		dockerfile: pathInput({ description: "Dockerfile path.", default: "Dockerfile" }),
		provenance: booleanInput({ description: "Emit build provenance.", default: "false" }),
	},
	outputs: {
		imageRef: stringOutput({ description: "Published image reference." }),
	},
	run: async ({ exec, input, log }) => {
		const imageRef = `${input.image}:${input.tag}`;
		await log.group("Publish container image", async () => {
			await exec("docker", [
				"buildx",
				"build",
				"--file",
				input.dockerfile,
				"--tag",
				imageRef,
				"--push",
				"--provenance",
				input.provenance ? "true" : "false",
				input.context,
			]);
		});
		return { imageRef };
	},
});
