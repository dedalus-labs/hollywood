export const toGitHubName = (value: string): string =>
	value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
