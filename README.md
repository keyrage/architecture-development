# @keyrage/architecture-development

A read-only Swamp extension for reviewing a complete, active published ArchiMate 3.2 semantic model. It collects bounded v1 HTTP evidence coherently, runs a user-selected subset of six specialists and eight fixed declaration-driven review lenses, preserves every finding, ranks recommendations deterministically, and records follow-up and disposition history.

## Safety boundary

The extension uses only the packaged Archi Software Factory public v1 HTTP/JSON query contract. It never uses Memgraph/Bolt, mutates a model, performs formal ArchiMate validation, reads diagrams or unpublished history, or inspects repository files that are not referenced by the model's `softwareFactory.executable.v1.targetPath` properties. Bearer credentials are configured through a sensitive vault-backed model argument and never enter resources, instance names, logs, or errors.

## Configure a model

Create one `@keyrage/architecture-development/review` definition for each model. Store only non-secret metadata in the definition and a vault expression for the credential:

```yaml
type: '@keyrage/architecture-development/review'
name: payments-review
version: 1
globalArguments:
  modelId: payments-model
  endpointFile: ${XDG_RUNTIME_DIR:-$HOME/.cache}/archimate-software-factory/agent-query-endpoint
  bearerToken: ${{ vault.get('architecture-review', 'payments-token') }}
  repositoryRoot: /workspaces/payments
```

Select a definition explicitly. The default expected groups are Application and Technology; the default specialist selection is all six. A user may choose any non-empty subset before collection. Version-2 reviews additionally support the fixed domain, qualityAttribute, deployment, data, security, resilience, governance, and organization lenses. For a **lens-only V2 review**, explicitly send `selectedSpecialists: []` with `selectedLenses` on `start_review` and verify the returned specialist selection is empty. Omitting specialists currently also selects all six, persists that scope across resume, increases usage and findings, and competes in global ranking. This accepted temporary deviation is tracked as TASK-2.6; see `docs/review-lenses.md` for the request example.

## Read-only review lifecycle

```text
start_review → collect_evidence → record_assessments → record_synthesis → dialogue
                                                                          ↘ stop/resume
```

Collection stages every page in a method-run temporary directory and writes nothing durable until all folders, elements, and relationships are revision-coherent. The first published-revision movement discards the staging tree and retries once; a second movement fails closed. Evidence chunks and the manifest retain model ID, revision, counts, and SHA-256 digests.

Synthesis requires exact finding coverage, scores every recommendation with `impact*4 + confidence*3 + scope*2 + (6-effort)`, and returns strengths plus the global top ten. Specialist selection is immutable within an epoch. A changed revision on resume starts a new epoch while retaining prior records. Dispositions are explicit (`accepted`, `rejected`, `deferred`, `needs-investigation`, or `undecided`) and never inferred.

## Development checks

The repository uses the bundled Deno identified by `swamp doctor extensions`:

```bash
/home/agent/.swamp/deno/deno check extensions/models/architecture-development/architecture_review.ts extensions/models/architecture-development/_lib/*.ts
/home/agent/.swamp/deno/deno fmt --check extensions/models/architecture-development
/home/agent/.swamp/deno/deno lint extensions/models/architecture-development
swamp extension push manifest.yaml --dry-run
```

The mandatory adversarial-review report must be presented and acknowledged before running unit tests or a live smoke. A verified public repository URL is still required before publication; no registry push is performed by this repository's checks.
