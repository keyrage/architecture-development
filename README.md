# Architecture Development

This repository is the starting point for an Archi Software Factory Swamp extension that will guide AI agents and provide the extension-facing interface to the Archi model.

## Repository role

- This is a separate git repository under the Archi Software Factory parent directory.
- It is for the `architecture-development` Swamp extension and its delivery workflow.
- Keep this repository distinct from `../archimate-software-factory`, which contains the Archi plug-in/application implementation.
- Keep Swamp runtime state (`.swamp/`) local and uncommitted.

## Development roadmap

Development starts with a read-only, whole-model ArchiMate 3.2 assessment performed by specialist agents and discussed with the user. Later slices add richer lenses, structured change proposals, governed mutation, and architecture-guided software delivery. See [`docs/development-roadmap.md`](docs/development-roadmap.md).

## Initialized tooling

- Git repository initialized in this directory.
- Backlog.md initialized in `.backlog/`.
- Swamp repository initialized via `.swamp.yaml`.
- The `@adam/software-factory` extension is pinned in `extensions/models/upstream_extensions.json`.
- The software-factory instance is defined at `models/@adam/software-factory/architecture-development-factory.yaml`.

## Restoring Swamp dependencies

After cloning or checking out this repository, restore the pinned Swamp extension with:

```bash
swamp extension install
```

Validate the factory definition with:

```bash
swamp model method run architecture-development-factory validate
swamp model method run architecture-development-factory describe
```

## Starting future work

Use Backlog.md for work-item tracking:

```bash
backlog instructions overview
backlog task list --plain
```

Start a factory run only for an explicit Backlog work item:

```bash
swamp model method run architecture-development-factory start --input workItem=TASK-1
swamp model method run architecture-development-factory status --input workItem=TASK-1
```

Resume existing work with `status`; do not call `start` again for an existing work item.
