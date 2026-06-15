
//#region src/environments.d.ts
type EnvironmentAccount = Readonly<{
  id: `${number}`;
}>;
type EnvironmentAccounts = {
  readonly [name: string]: EnvironmentAccount;
};
type EnvironmentDefinition<AccountName extends string> = Readonly<{
  account: AccountName;
  artifactSource?: string;
  branches?: readonly string[];
  githubEnvironment?: string;
}>;
type EnvironmentDefinitions<AccountName extends string> = {
  readonly [name: string]: EnvironmentDefinition<AccountName>;
};
type EnvironmentRegistry<Accounts extends EnvironmentAccounts, Environments extends EnvironmentDefinitions<Extract<keyof Accounts, string>>> = Readonly<{
  accounts: Accounts;
  environments: Environments;
}>;
type EnvironmentName<Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>> = Extract<keyof Registry["environments"], string>;
type AccountName<Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>> = Extract<keyof Registry["accounts"], string>;
type ResolvedEnvironment<Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>> = Readonly<{
  account: AccountName<Registry>;
  accountId: `${number}`;
  artifactSource: EnvironmentName<Registry>;
  definition: EnvironmentDefinition<string>;
  name: EnvironmentName<Registry>;
}>;
type EnvironmentSelector = Readonly<{
  environment?: string;
  refName?: string;
}>;
declare const defineEnvironmentRegistry: <const Accounts extends EnvironmentAccounts, const Environments extends EnvironmentDefinitions<Extract<keyof Accounts, string>>>(registry: EnvironmentRegistry<Accounts, Environments>) => EnvironmentRegistry<Accounts, Environments>;
declare const resolveEnvironment: <const Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>>(registry: Registry, environment: string) => ResolvedEnvironment<Registry>;
declare const selectEnvironmentName: <const Registry extends EnvironmentRegistry<EnvironmentAccounts, EnvironmentDefinitions<string>>>(registry: Registry, selector: EnvironmentSelector) => EnvironmentName<Registry>;
//#endregion
export { AccountName, EnvironmentAccount, EnvironmentAccounts, EnvironmentDefinition, EnvironmentDefinitions, EnvironmentName, EnvironmentRegistry, EnvironmentSelector, ResolvedEnvironment, defineEnvironmentRegistry, resolveEnvironment, selectEnvironmentName };