import { and, eq, gh, ne, or } from "../src/index";

export const trustedCiRun = and(
	eq(gh.github.repository, "dedalus-labs/hollywood"),
	or(
		ne(gh.github.eventName, "pull_request"),
		eq(gh.github.event.pullRequest.head.repository.fullName, gh.github.repository),
	),
);
