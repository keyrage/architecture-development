# Swamp factory

This repository is prepared as a Swamp repository for developing the `architecture-development` extension.

## Tracked setup

- `.swamp.yaml` records the Swamp repository identity.
- `extensions/models/upstream_extensions.json` pins `@adam/software-factory` version `2026.06.15.1`.
- `models/@adam/software-factory/architecture-development-factory.yaml` defines the local software-factory instance.
- `.swamp/` is ignored local runtime state and must not be committed.

## Factory purpose

`architecture-development-factory` guides development of the Swamp extension that will help agents work with the Archi model. Its stages cover planning, plan review, implementation, verification, code review, and explicit human approval before completion.

The factory deliberately keeps this extension repository separate from the Archi Software Factory application repository. Work here should define extension guidance, contracts, and Archi model interface behavior rather than modifying `../archimate-software-factory`.

## Common commands

```bash
swamp extension install
swamp model method run architecture-development-factory validate
swamp model method run architecture-development-factory describe
swamp model method run architecture-development-factory status --input workItem=TASK-1
```

Human approval gates must only be satisfied after explicit human instruction.
