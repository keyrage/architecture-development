---
id: TASK-2.5
title: Guide software delivery with current architecture context
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
labels:
  - vertical-slice
  - software-delivery
  - alignment
dependencies:
  - TASK-2.4
documentation:
  - docs/development-roadmap.md
parent_task_id: TASK-2
priority: medium
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once collaborative review, proposals, and governed model evolution are established, delivery agents need a safe way to use selected current architecture context during planning and implementation. The extension should improve alignment without injecting an entire model blindly or treating architecture guidance as implicit approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can select architecture scope relevant to a software work item and expose only that revision-coherent context to delivery agents
- [ ] #2 Planning and implementation outputs cite the model revision and canonical IDs that informed decisions
- [ ] #3 The workflow reports architecture-impact and alignment findings without treating them as human approval or mutating the model implicitly
- [ ] #4 Executable-design vocabulary validation is integrated where model references require it
- [ ] #5 A changed published revision invalidates stale delivery context and requires explicit refresh before architecture-dependent gates pass
<!-- AC:END -->
