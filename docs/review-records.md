# Review records

Every resource name is globally unique and starts with its spec name:

- `reviewState-<reviewId>-e<epoch>-s0` stores immutable selected specialists and lifecycle phase.
- `evidenceChunk-<reviewId>-e<epoch>-s<sequence>` stores bounded pages and digest.
- `evidenceManifest-<reviewId>-e<epoch>-s0` proves complete counts and revision.
- `specialistAssessments-<reviewId>-e<epoch>-s0` stores exactly one canonical-order result per selected role.
- `synthesis-<reviewId>-e<epoch>-s0` preserves all source finding IDs and deterministic recommendation ordering.
- `followup-<reviewId>-e<epoch>-s<sequence>` stores selected-specialist dialogue.
- `disposition-<reviewId>-e<epoch>-s<recommendationId>` stores explicit rationale.

Resources intentionally contain no endpoint URL, bearer token, token-derived value, or unreferenced repository content. A citation consists of a canonical model ID and, for repository evidence, a normalized path plus an exact line range. If no executable-design references exist, repository alignment is recorded as not assessable rather than a defect.

An epoch's selected role set cannot be altered. Stopping and starting a different selection creates a new epoch and leaves all prior resources addressable. Revision movement during resume has the same behavior and requires fresh collection and assessment.

V2 persisted records are revalidated when consumed, not trusted merely because their schema and identity match. Synthesis requires exactly one assessment per selected role in canonical order, bound to persisted snapshots and integrity-checked evidence. Specialist evidence keys and limitations match their snapshots; lens applicability and finding permissions are derived from evidence. V2 dialogue and stop/resume revalidate the same assessment chain and canonical synthesis coverage, provenance, scoring, and ranking before writing.

V1 synthesis also revalidates its consumed selected-specialist inventory. For legacy compatibility, V1 dialogue requires strict synthesis identity and recommendation membership without imposing V2 snapshot or retrospective assessment-chain requirements; V1 resume retains its shipped behavior.
