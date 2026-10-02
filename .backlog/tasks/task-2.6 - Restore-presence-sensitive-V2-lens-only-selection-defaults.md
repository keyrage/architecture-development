---
id: TASK-2.6
title: Restore presence-sensitive V2 lens-only selection defaults
status: To Do
assignee: []
created_date: '2026-10-02 19:50'
labels: []
dependencies: []
references:
  - docs/review-lenses.md
parent_task_id: TASK-2
priority: high
type: bug
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deferred T22-CR5-001 from TASK-2.2 by explicit user acceptance. A public schemaVersion:2 start specifying selectedLenses but omitting selectedSpecialists currently adds all six specialists, increasing review scope, usage, and ranking competition. Workaround: always pass selectedSpecialists: [] for lens-only reviews. Preserve V1 behavior and immutable epoch snapshots; no model mutations or sibling changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When only selectedLenses is supplied, public start output, state, and snapshots contain no specialists and exactly the requested lenses.
- [ ] #2 All four selection-presence combinations follow approved plan v5, including neither supplied, specialists-only, lenses-only, and both supplied; empty combined selection is rejected.
- [ ] #3 Public lifecycle regressions prove lens-only selection is retained on stop/resume and revision movement.
- [ ] #4 Documentation and agent guidance remove the mandatory empty-specialist workaround only after the fix is verified.
<!-- AC:END -->
