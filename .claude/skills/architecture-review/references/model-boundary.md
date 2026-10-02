# Model boundary

The only model interface is the packaged Archi Software Factory v1 HTTP/JSON contract:

- `GET /agent-query/v1` discovery;
- `GET /agent-query/v1/folders`;
- `GET /agent-query/v1/elements`;
- `GET /agent-query/v1/relationships`.

Send `Authorization: Bearer …` only in the request header. Read the ephemeral endpoint file at execution time. Require `apiVersion=v1`, `graphContractVersion=2`, configured model ID, published revision, fixed limits, bounded pages, opaque cursor replay, unique canonical IDs, and active relationship endpoints. Never edit cursors or combine revisions.

The initial review never calls mutation, traversal, lookup, tombstone, revision, or provenance routes. It does not duplicate Archi's formal metamodel validation. Endpoint and token values are never durable review data.
