---
id: TASK-2.2
title: Add richer configurable architecture review lenses
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
labels:
  - vertical-slice
  - review-lenses
dependencies:
  - TASK-2.1
documentation:
  - docs/development-roadmap.md
parent_task_id: TASK-2
priority: medium
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The initial specialist assessment establishes the review protocol but cannot cover every domain and quality concern deeply. Users need additional review lenses that can be selected without weakening complete-model evidence, traceability, dialogue, or the distinction between evidence and heuristic interpretation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can select additional independently documented review lenses for relevant domain, quality-attribute, deployment, data, security, resilience, governance, and organization concerns
- [ ] #2 Each lens declares required evidence, applicability, limitations, and whether each conclusion is factual or heuristic
- [ ] #3 Additional lens findings participate in the same complete durable specialist record, global ranking, top-ten presentation, and user-directed dialogue
- [ ] #4 Synthetic tests demonstrate each lens against applicable and non-applicable models without turning missing non-expected concerns into false defects
<!-- AC:END -->
