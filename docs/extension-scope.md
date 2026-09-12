# Architecture-development extension scope

## Intent

The `architecture-development` Swamp extension will guide AI agents during architecture-development work and expose a clear interface to the Archi model used by the Archi Software Factory.

## Initial responsibilities

- Describe how an agent should select and use an Archi model context for a work item.
- Provide Swamp-facing contracts for reading architecture facts from the model.
- Make model assumptions and provenance explicit in recorded work products.
- Support verification that generated or implemented work remains aligned with the published architecture model.

## Boundaries

- This repository owns the Swamp extension and its workflows/contracts.
- `../archimate-software-factory` owns the Archi plug-in/application implementation.
- The extension should not silently modify the Archi application repository or infer human approvals.
- Runtime state and local credentials must stay out of version control.

## Deferred decisions

- Exact Swamp extension manifest and TypeScript model/workflow layout.
- The precise Archi model query protocol and authentication boundary.
- Whether model mutations are allowed in v1 or the extension is read-only guidance initially.
