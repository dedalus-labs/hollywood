export type EnvironmentAccount = Readonly<{
	id: `${number}`;
}>;

export type EnvironmentAccounts = {
	readonly [name: string]: EnvironmentAccount;
};

export type EnvironmentDefinition<AccountName extends string> = Readonly<{
	account: AccountName;
	artifactSource?: string;
	branches?: readonly string[];
	githubEnvironment?: string;
}>;

export type EnvironmentDefinitions<AccountName extends string> = {
	readonly [name: string]: EnvironmentDefinition<AccountName>;
};

export type EnvironmentRegistry<
	Accounts extends EnvironmentAccounts,
	Environments extends EnvironmentDefinitions<Extract<keyof Accounts, string>>,
> = Readonly<{
	accounts: Accounts;
	environments: Environments;
}>;

export type EnvironmentName<Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>> =
	Extract<keyof Registry["environments"], string>;

export type AccountName<Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>> =
	Extract<keyof Registry["accounts"], string>;

export type ResolvedEnvironment<
	Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>,
> = Readonly<{
	account: AccountName<Registry>;
	accountId: `${number}`;
	artifactSource: EnvironmentName<Registry>;
	definition: EnvironmentDefinition<string>;
	name: EnvironmentName<Registry>;
}>;

export type EnvironmentSelector = Readonly<{
	environment?: string;
	refName?: string;
}>;

export const defineEnvironmentRegistry = <
	const Accounts extends EnvironmentAccounts,
	const Environments extends EnvironmentDefinitions<Extract<keyof Accounts, string>>,
>(
	registry: EnvironmentRegistry<Accounts, Environments>,
): EnvironmentRegistry<Accounts, Environments> => {
	for (const [name, account] of Object.entries(registry.accounts)) {
		if (!/^\d{12}$/.test(account.id)) {
			throw new Error(`environment account ${name} must use a 12-digit id`);
		}
	}
	return registry;
};

export const resolveEnvironment = <
	const Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>,
>(
	registry: Registry,
	environment: string,
): ResolvedEnvironment<Registry> => {
	const name = environment.trim() as EnvironmentName<Registry>;
	const definition = registry.environments[name];
	if (definition === undefined) {
		throw new Error(`unknown environment: ${environment}`);
	}
	const account = registry.accounts[definition.account];
	if (account === undefined) {
		throw new Error(`environment ${name} references unknown account: ${definition.account}`);
	}
	const artifactSource = (definition.artifactSource ?? name) as EnvironmentName<Registry>;
	if (registry.environments[artifactSource] === undefined) {
		throw new Error(`environment ${name} references unknown artifact source: ${artifactSource}`);
	}
	return {
		account: definition.account as AccountName<Registry>,
		accountId: account.id,
		artifactSource,
		definition,
		name,
	};
};

export const selectEnvironmentName = <
	const Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>,
>(
	registry: Registry,
	selector: EnvironmentSelector,
): EnvironmentName<Registry> => {
	const explicit = selector.environment?.trim();
	if (explicit !== undefined && explicit !== "") {
		return resolveEnvironment(registry, explicit).name;
	}
	const refName = selector.refName?.trim();
	if (refName === undefined || refName === "") {
		throw new Error("environment or refName is required");
	}
	const match = Object.entries(registry.environments).find(([, definition]) =>
		definition.branches?.includes(refName),
	);
	if (match === undefined) {
		throw new Error(`no environment branch mapping for ref: ${refName}`);
	}
	return match[0] as EnvironmentName<Registry>;
};
