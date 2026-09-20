---
id: TASK-2.4
title: Apply approved proposals through the governed model mutation interface
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
labels:
  - vertical-slice
  - mutation
  - blocked-external
dependencies:
  - TASK-2.3
references:
  - >-
    ../archimate-software-factory/.backlog/tasks/task-29 -
    Govern-agent-mutations-through-a-constrained-audited-boundary.md
documentation:
  - docs/development-roadmap.md
parent_task_id: TASK-2
priority: high
type: feature
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structured proposals should eventually become authoritative changes without asking agents to use arbitrary Cypher. This work is blocked until Archi Software Factory provides its supported governed mutation contract; legacy direct Bolt writes are explicitly unacceptable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The extension refuses mutation when the governed plug-in capability is unavailable or incompatible and never falls back to direct Bolt access
- [ ] #2 The user sees the exact proposed operations and explicitly approves them before submission
- [ ] #3 Submission enforces the selected model identity, expected published revision, actor identity, rationale, and all-or-nothing behavior
- [ ] #4 Successful mutations return the new published revision and complete audit references; stale or rejected operations leave no partial model change
- [ ] #5 Synthetic and plug-in contract tests cover approval denial, stale revisions, revocation, unsupported operations, complete success, and rollback
<!-- AC:END -->
