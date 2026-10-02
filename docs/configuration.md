# Configuration

A model definition is one selectable Archi model. `modelId` is the canonical model identifier and `endpointFile` points to Archi's ephemeral endpoint metadata file. `repositoryRoot` is optional and is used only by the repository-alignment specialist. `bearerToken` must be a sensitive `${{ vault.get('vault-name', 'key') }}` expression; do not put a literal token in YAML, command arguments, environment variables, fixtures, or logs.

The endpoint is read at execution time. The model lists, status output, and durable resources contain only model ID, endpoint-file path, repository root, groups, revision, and review records. Authentication failures are reported as missing, revoked, or incompatible identity without exposing the bearer value.

The public boundary is the v1 loopback HTTP/JSON contract. Only discovery and active folder, element, and relationship collections are used. Limits are fixed by discovery: page size at most 200, response size at most 4 MiB. The extension does not query tombstones, revisions, provenance, traversal, or mutation routes.
