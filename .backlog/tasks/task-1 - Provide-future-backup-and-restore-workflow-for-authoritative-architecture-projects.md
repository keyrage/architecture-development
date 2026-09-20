---
id: TASK-1
title: >-
  Provide future backup and restore workflow for authoritative architecture
  projects
status: To Do
assignee: []
created_date: '2026-09-14 05:10'
labels: []
dependencies: []
references:
  - AGENTS.md
  - docs/extension-scope.md
priority: medium
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authoritative architecture projects may outlive a single workstation or local Memgraph deployment. This capability is being deferred out of the Archi plug-in/application backlog and should instead be designed as a future architecture-development Swamp extension function that agents/operators can discover, run, monitor, and recover through explicit Swamp entrypoints while respecting the sibling Archi Software Factory integration boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Swamp extension workflow can create a consistent backup of an authoritative architecture project, including active semantics, tombstones, model identity, current revision, complete revision lineage, and audit events, while excluding credentials, runtime state, and unrelated local files.
- [ ] #2 A verified backup can be restored into a clean supported environment, re-associated with the retained architecture working copy through documented integration boundaries, and used for the next publish or architecture-development workflow without canonical-ID or history drift.
- [ ] #3 Corrupt, incomplete, wrong-model, unsupported-version, credential-bearing, and unsafe target backups fail closed with actionable non-secret diagnostics and without replacing a healthy deployment or project association.
- [ ] #4 Automated acceptance exercises the extension-facing workflow against a real authoritative graph: publish/update/delete, back up, destroy or isolate the source deployment, restore, compare graph/history integrity, and run the next revision-producing workflow.
<!-- AC:END -->
