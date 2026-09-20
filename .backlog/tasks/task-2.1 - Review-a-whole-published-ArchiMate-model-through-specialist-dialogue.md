---
id: TASK-2.1
title: Review a whole published ArchiMate model through specialist dialogue
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
labels:
  - vertical-slice
  - review
  - read-only
dependencies: []
references:
  - ../archimate-software-factory/agent-query-contract/v1/openapi.json
  - ../archimate-software-factory/docs/agent-model-query.md
  - ../archimate-software-factory/docs/executable-design-vocabulary.md
documentation:
  - docs/development-roadmap.md
parent_task_id: TASK-2
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need an initial useful outcome before governed model mutation exists: an independent assessment of the complete current active published semantic model, followed by user-directed discussion. The extension must work across the full ArchiMate 3.2 lexicon while leaving formal metamodel validation to Archi, preserve every specialist finding, and keep model credentials secret.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The user selects a vault-configured model and expected ArchiMate groups, with Application and Technology selected by default
- [ ] #2 The complete current active published model is processed in bounded chunks without silent sampling or mixed-revision evidence
- [ ] #3 Separate completeness, cross-layer traceability, documentation, Motivation/strategy, repository-alignment, and advisory-derived-relationship specialists run in parallel when supported and sequentially otherwise
- [ ] #4 A synthesizer preserves original and deduplicated findings, globally ranks every recommendation with an explained impact/confidence/scope/effort score, and presents strengths plus the top ten in the agent UI
- [ ] #5 The user can choose a recommendation, request specialist follow-up, record a concise accepted/rejected/deferred/needs-investigation rationale, stop, and resume
- [ ] #6 Findings cite canonical model IDs and applicable referenced repository paths and line ranges; unreferenced repository content is not inspected during initial assessment
- [ ] #7 A changed published revision triggers one automatic restart during collection and requires a fresh assessment on resume while preserving prior review history
- [ ] #8 Synthetic tests cover the query contract, chunking, restart behavior, full ArchiMate 3.2 input vocabulary, ranking, dialogue, durable records, sequential fallback, and credential non-retention
<!-- AC:END -->
