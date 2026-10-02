---
id: TASK-2
title: Deliver collaborative ArchiMate architecture development guidance
status: In Progress
assignee: []
created_date: '2026-09-20 07:19'
updated_date: '2026-09-21 07:11'
labels:
  - initiative
  - archimate
  - swamp-extension
dependencies: []
references:
  - docs/extension-scope.md
documentation:
  - docs/development-roadmap.md
priority: high
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Architecture work is currently split between the authoritative Archi Software Factory model and ad hoc agent conversations. Users need a versioned Swamp extension that helps coding agents assess, discuss, propose, and eventually apply architecture changes while preserving explicit model scope, human authority, and traceable model evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can review the complete current active published ArchiMate semantic model through a guided agent dialogue
- [ ] #2 Review recommendations and later change proposals remain traceable to a published revision and canonical model identifiers
- [ ] #3 Model mutation occurs only through a supported governed plug-in interface after explicit user approval
- [ ] #4 Architecture context can ultimately guide software planning and delivery without coupling the extension to plug-in internals
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **Govern the initiative through its child slices.** Keep TASK-2 as the active umbrella record and give TASK-2.1 through TASK-2.5 separate factory runs, plans, verification, review, and approval in dependency order. Do not complete the parent after only the first slice.
2. **Deliver TASK-2.1 first as a read-only vertical slice.** Package `@keyrage/architecture-development`; resolve the installed Swamp extension and vault APIs; implement model-backed durable review state, a vault-safe v1 agent-query adapter, complete revision-coherent pagination/chunking, six specialist roles, synthesis/ranking, user-directed dialogue/dispositions, stop/resume, schemas, synthetic tests, and operator guidance. Use only the stable HTTP/JSON contract and inspect only model-referenced repository evidence.
3. **Add richer lenses in TASK-2.2.** Extend the same evidence and specialist contracts with configurable domain, quality, deployment, data, security, resilience, governance, and organization lenses, including applicability and factual-versus-heuristic metadata.
4. **Add read-only proposals in TASK-2.3.** Convert accepted recommendations into a versioned, validated, human-confirmed proposal linked to the selected model, expected published revision, canonical IDs, specialist evidence, dispositions, and repository citations.
5. **Keep mutation blocked until TASK-29 exists.** For TASK-2.4, re-plan against the delivered governed plug-in contract, require exact-operation presentation and explicit approval, optimistic concurrency, actor/rationale, atomic behavior, and revision/audit results. Never fall back to direct Bolt/Cypher.
6. **Integrate architecture-guided delivery in TASK-2.5.** Expose only user-selected revision-coherent context to planning and implementation, preserve canonical citations, report impact/alignment findings, validate executable-design references, and invalidate stale context without implicit approval or mutation.
7. **Verify each boundary independently.** Run extension formatting/quality, shipped model/workflow validation, targeted synthetic and contract tests, and secret-leakage checks for every child. Complete TASK-2 only after all child evidence satisfies the parent acceptance criteria.

**Architecture boundary:** reads use `../archimate-software-factory/agent-query-contract/v1/openapi.json` and packaged Archi's ephemeral loopback service; formal ArchiMate validation stays in Archi. Credentials remain in a Swamp vault and never enter arguments or retained records. Future writes use only the supported governed mutation interface.

**Primary risks:** the parent could be falsely completed after one slice; exact Swamp vault bindings still require a TASK-2.1 spike; large models require bounded complete processing; revisions can move mid-review; heuristic findings can be mistaken for formal validation; mutation is externally blocked; existing TASK-1 archival changes must remain isolated from TASK-2 commits.
<!-- SECTION:PLAN:END -->
