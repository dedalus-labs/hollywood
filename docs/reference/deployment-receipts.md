# Deployment verification receipts

Hollywood binds a successful deployment to the image that a trusted workflow
verified. `verifyGitHubDeploymentReceipt` reads GitHub API responses through a
caller-supplied authenticated reader. It returns a boolean. Malformed provider
data and reader failures throw.

The requirement names a repository, protected base branch, revision, environment,
component (`task`), publisher login, and verification workflow path. The latest
deployment for that environment and task must contain the required revision.
GitHub commit comparison proves that the deployed revision is identical to or
ahead of the prerequisite merge. Behind or diverged revisions block.
An earlier success cannot override an unsuccessful current deployment.
The latest status must be `success` in the same environment from that publisher.

The deployment payload contains `artifact_digest` (`sha256:` plus 64 hex digits)
and `verification_run_id`. The named verification workflow must complete
successfully on a `push` to the protected base at the actual deployed revision.
The workflow deploys that image and verifies its health before publishing success.

After health verification, upload an immutable Actions artifact named
`deployment-<deployment-id>-<image-digest>`. Use the 64 hex digits of the measured
image digest, without `sha256:`. Include the measured deployment receipt in the
artifact. Hollywood requires this exact artifact name from the verification run,
a GitHub artifact digest, and matching run ID and revision. Expired receipts block.
The artifact name binds deployment identity and image digest to workflow output.
The verification workflow owns provider-specific health checks.

Use a dedicated deployment App identity for the publisher. Restrict its
credentials to the trusted workflow and protected environment. Sharing that
identity with untrusted jobs defeats receipt authentication. Protect the workflow
source and artifact-upload step through branch rules and review.

```typescript
import { verifyGitHubDeploymentReceipt } from "@dedalus-labs/hollywood";

const verified = await verifyGitHubDeploymentReceipt(
  readRepositoryApi,
  { repository: "acme/project", base: "main" },
  { environment: "production", task: "api", publisher: "deploy[bot]",
    workflow: ".github/workflows/deploy-api.yml" },
  prerequisiteMergeRevision,
);
```

`readRepositoryApi(path)` returns parsed JSON for a REST path relative to that
repository. It must authenticate reads and reject HTTP errors. The revision is
a full commit SHA. See GitHub's [deployment statuses](https://docs.github.com/en/rest/deployments/statuses)
and [workflow artifacts](https://docs.github.com/en/rest/actions/artifacts).
