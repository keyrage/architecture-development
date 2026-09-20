---
id: TASK-2
title: Deliver collaborative ArchiMate architecture development guidance
status: To Do
assignee: []
created_date: '2026-09-20 07:19'
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
