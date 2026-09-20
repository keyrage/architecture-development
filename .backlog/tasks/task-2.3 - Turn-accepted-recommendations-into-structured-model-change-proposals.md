---
id: TASK-2.3
title: Turn accepted recommendations into structured model-change proposals
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
labels:
  - vertical-slice
  - change-proposal
  - read-only
dependencies:
  - TASK-2.2
documentation:
  - docs/development-roadmap.md
parent_task_id: TASK-2
priority: high
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After discussing review findings, users need accepted recommendations converted into a precise handoff rather than losing architectural intent in prose. The proposal must remain read-only, human-reviewable, revision-aware, and usable by a future governed mutation slice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Accepted recommendations can be assembled into a machine-readable proposal of additions, updates, moves, and removals without changing the model
- [ ] #2 Every proposed operation records canonical targets where applicable, proposed ArchiMate types and relationships, semantic content, rationale, assumptions, source recommendation, and expected published revision
- [ ] #3 The agent UI presents a concise human-readable proposal and requires the user to confirm its contents before it is finalized
- [ ] #4 Proposal validation rejects unresolved references, mixed model identities, stale baselines, and operations unsupported by the proposal contract
- [ ] #5 The durable proposal retains traceability to specialist evidence, user dispositions, model canonical IDs, repository citations, and the reviewed revision
<!-- AC:END -->
