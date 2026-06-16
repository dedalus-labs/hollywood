import {
	action,
	job,
	stringInput,
	uses,
	workflow,
	type ScriptActionContext,
	type ScriptFs,
} from "../src/index";
import { checkoutAction, setupNodeAction } from "./actions";

const vouchedPath = "VOUCHED.td";

const contributorInputs = {
	author: stringInput({ description: "GitHub login that opened the pull request." }),
	bootstrapMaintainers: stringInput({
		description: "Maintainers allowed to bootstrap the contributor registry.",
	}),
	trustedAutomationAuthors: stringInput({
		default: "",
		description: "Exact GitHub app/bot logins trusted for repository automation.",
	}),
} as const;

type ContributorCheck = "CLA" | "Vouch";
type ContributorContext = Pick<
	ScriptActionContext<typeof contributorInputs>,
	"fs" | "input" | "log"
>;

export const checkCla = action({
	name: "Check CLA",
	description: "Verify that a pull request author has accepted the CLA.",
	localActionPath: "check-cla",
	inputs: contributorInputs,
	outputs: {},
	run: async (context) => {
		await checkContributor("CLA", context);
		return {};
	},
});

export const checkVouch = action({
	name: "Check Vouch",
	description: "Verify that a pull request author is vouched for contributions.",
	localActionPath: "check-vouch",
	inputs: contributorInputs,
	outputs: {},
	run: async (context) => {
		await checkContributor("Vouch", context);
		return {};
	},
});

const checkContributor = async (
	check: ContributorCheck,
	{ fs, input, log }: ContributorContext,
): Promise<void> => {
	const author = normalizeHandle(input.author);
	const bootstrapMaintainers = handleSet(input.bootstrapMaintainers);
	const trustedAutomationAuthors = handleSet(input.trustedAutomationAuthors);

	if (trustedAutomationAuthors.has(author)) {
		log.info(`@${input.author} is a trusted repository automation author`);
		return;
	}

	const vouched = await readVouched(fs);
	if (vouched === null) {
		if (bootstrapMaintainers.has(author)) {
			log.info(`@${input.author} is a ${check} bootstrap maintainer`);
			return;
		}
		throw new Error(
			`${vouchedPath} is not present on the trusted base commit, and @${input.author} is not a ${check} bootstrap maintainer.`,
		);
	}

	const entry = findContributor(vouched, author);
	if (entry?.denouncedReason !== undefined) {
		throw new Error(`@${input.author} is denounced in ${vouchedPath}: ${entry.denouncedReason}`);
	}
	if (entry !== null) {
		log.info(passMessage(check, input.author));
		return;
	}

	throw new Error(requiredMessage(check, input.author));
};

const readVouched = async (fs: ScriptFs): Promise<string | null> => {
	try {
		return await fs.readText(vouchedPath);
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return null;
		}
		throw error;
	}
};

const findContributor = (
	vouched: string,
	authorHandle: string,
): { readonly denouncedReason?: string } | null => {
	const authorKey = `github:${authorHandle}`;
	for (const rawLine of vouched.split("\n")) {
		const line = rawLine.replace(/\r$/, "").trim();
		if (line.length === 0 || line.startsWith("#")) {
			continue;
		}

		const [token, ...reasonParts] = line.split(/\s+/);
		if (token === undefined) {
			continue;
		}

		const isDenounced = token.startsWith("-");
		const rawHandle = isDenounced ? token.slice(1) : token;
		const key = contributorKey(rawHandle);
		if (key !== authorKey) {
			continue;
		}
		if (isDenounced) {
			return { denouncedReason: reasonParts.join(" ") || "no reason recorded" };
		}
		return {};
	}
	return null;
};

const contributorKey = (rawHandle: string): string => {
	const handle = rawHandle.trim().replace(/^@/, "");
	if (handle.includes(":")) {
		return handle.toLowerCase();
	}
	return `github:${handle.toLowerCase()}`;
};

const handleSet = (handles: string): ReadonlySet<string> =>
	new Set(handles.split(/[,\s]+/).map(normalizeHandle).filter(isNonEmpty));

const normalizeHandle = (handle: string): string =>
	handle.trim().toLowerCase().replace(/^@/, "").replace(/^github:/, "");

const isNonEmpty = (value: string): boolean => value.length > 0;

const isMissingFile = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { readonly code?: unknown }).code === "ENOENT";

const passMessage = (check: ContributorCheck, author: string): string => {
	if (check === "CLA") {
		return `@${author} has accepted CLA.md according to ${vouchedPath}`;
	}
	return `@${author} is listed in ${vouchedPath}`;
};

const requiredMessage = (check: ContributorCheck, author: string): string =>
	[
		`${check} required for @${author}.`,
		"",
		`@${author} is not listed in ${vouchedPath}.`,
		"",
		check === "CLA"
			? `Being listed in ${vouchedPath} records that a maintainer verified CLA acceptance.`
			: "Hollywood only accepts external contributions from vouched contributors.",
		"",
		"To get vouched:",
		"",
		'1. Open a "Vouch request" issue.',
		"2. Confirm that you have read and accept CLA.md.",
		"3. Link public work or ask an existing vouched contributor to sponsor you.",
		`4. Wait for a maintainer to add your handle to ${vouchedPath}.`,
	].join("\n");

const trustedBaseCheckout = {
	name: "Checkout trusted base",
	uses: checkoutAction,
	with: {
		ref: "${{ github.event.pull_request.base.sha }}",
		"persist-credentials": false,
	},
} as const;

const setupNode = {
	uses: setupNodeAction,
	with: {
		"node-version": "24",
	},
} as const;

const prepareHollywood = [
	trustedBaseCheckout,
	setupNode,
	{ name: "Install dependencies", run: "npm ci" },
	{ name: "Build Hollywood", run: "npm run build" },
	{ name: "Build local actions", run: "npm run build:actions" },
] as const;

const contributorWith = {
	author: "${{ github.event.pull_request.user.login }}",
	bootstrapMaintainers: "windsornguyen",
	trustedAutomationAuthors: "cind-bot[bot] cind[bot]",
} as const;

export const cla = workflow({
	name: "Contributor Checks",
	on: {
		pull_request: {
			branches: ["main"],
			types: ["opened", "reopened", "synchronize", "ready_for_review"],
		},
	},
	permissions: { contents: "read" },
	jobs: {
		cla: job({
			name: "CLA",
			"runs-on": "ubuntu-latest",
			steps: [
				...prepareHollywood,
				uses(checkCla, {
					name: "Check CLA",
					with: contributorWith,
				}),
			],
		}),
		vouch: job({
			name: "Vouch",
			"runs-on": "ubuntu-latest",
			needs: "cla",
			steps: [
				...prepareHollywood,
				uses(checkVouch, {
					name: "Check Vouch",
					with: contributorWith,
				}),
			],
		}),
	},
});
