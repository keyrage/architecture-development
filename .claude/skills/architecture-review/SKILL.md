---
name: architecture-review
description: Review one complete active published ArchiMate model through selectable specialist dialogue.
---

# Architecture review

Use this skill only for read-only architecture review. Never mutate Archi or access Memgraph/Bolt.

## Startup and selection

1. List configured `@keyrage/architecture-development/review` definitions. Show only definition name, model ID, endpoint-file path, repository root, and non-secret tags; never resolve or print the bearer token.
2. Require explicit model selection and expected-group selection. Default expected groups are Application and Technology. Valid groups are Motivation, Strategy, Business, Application, Technology, Physical, and Implementation & Migration.
3. Present every specialist in `references/specialists.md`. Default to all six; accept any non-empty subset. For a V2 lens-only review, confirm an empty specialist selection only when at least one lens is selected. Persist the canonical order; selection cannot change within an epoch.
4. Present the eight fixed optional v2 lenses (`domain`, `qualityAttribute`, `deployment`, `data`, `security`, `resilience`, `governance`, `organization`) with their required evidence and limitations. With no v2 selection fields, retain the default of all six specialists and no additional lenses. A combined selection must be non-empty. **For lens-only V2 starts, explicitly send `selectedSpecialists: []` along with `selectedLenses`** (for example, `{"schemaVersion":2,"reviewId":"domain-review","selectedSpecialists":[],"selectedLenses":["domain"]}`). Verify the start result has an empty `selectedSpecialists` array before collecting. Do not add this empty array to mixed-role or default selections. Until TASK-2.6 fixes the presence-sensitive default, omitting specialists while supplying lenses incorrectly selects all six specialists, increases usage and ranking competition, and persists the extra roles across resume. This deviation was accepted for TASK-2.2, not fixed.
5. Start a review epoch and discover v1, graph contract 2, model identity, capabilities, fixed limits, and published revision. Report missing/revoked credentials without values.

## Evidence, specialists, and lenses

Collect all folder, element, and relationship pages with opaque cursors and bounded chunks. Do not sample or inspect history, diagrams, tombstones, or unpublished edits. If the revision moves, discard all staged evidence and retry once; a second movement fails closed. Only after complete coherence is proven write evidence chunks and the manifest.

Process every chunk. Run only selected specialists, in parallel when the harness supports independent subagents and sequentially otherwise. Both paths must produce the same exact selected-role array. Repository alignment may read only normalized executable-design target paths under the configured repository root and must cite exact lines. Each v2 role uses its persisted evaluator snapshot. Lens applicability is `applicable`, `not-applicable`, or `insufficient-evidence`; unavailable required evidence is never treated as false. Findings identify whether they are factual or heuristic.

## Synthesis and dialogue

Record exactly one assessment for each selected role, preserving originals. Synthesis must cover the complete selected finding-ID set: no omitted or invented findings. Rank all recommendations with the documented deterministic score and show strengths plus the global top ten. The user chooses a recommendation and selected specialist for follow-up. Record explicit accepted/rejected/deferred/needs-investigation/undecided rationale; never infer approval.

The user may stop and resume. Resume re-discovers revision. An unchanged revision resumes dialogue; movement starts a fresh epoch with fresh evidence while preserving history. To change specialists, stop and start a fresh epoch. See `references/model-boundary.md`, `references/dialogue.md`, and `references/specialists.md`.
