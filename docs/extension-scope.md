# Architecture-development extension scope

## Intent

The `architecture-development` Swamp extension will guide AI agents during architecture-development work and expose a clear interface to the Archi model used by the Archi Software Factory.

## Initial responsibilities

- Guide specialist agents and a user through a whole-model review of the current active published ArchiMate 3.2 semantic model.
- Describe how an agent should select a vault-configured model and expected ArchiMate groups.
- Consume the versioned, read-only Archi Software Factory agent-query HTTP contract rather than plug-in internals or physical Memgraph schema.
- Provide Swamp-facing contracts for complete, revision-coherent architecture evidence and durable review records.
- Make model assumptions, canonical IDs, published revision, repository citations, and provenance explicit in recorded work products.
- Support verification that generated or implemented work remains aligned with the published architecture model.

## Boundaries

- This repository owns the Swamp extension and its workflows/contracts.
- `../archimate-software-factory` owns the Archi plug-in/application implementation.
- The extension should not silently modify the Archi application repository or infer human approvals.
- Runtime state and local credentials must stay out of version control.

## First-release decisions

- The registry name is `@keyrage/architecture-development`.
- The initial extension is read-only and suggests improvements or additions without changing the model.
- The supported model boundary is the Archi Software Factory v1 agent-query HTTP/JSON contract while packaged Archi is running.
- Credentials are selected from a Swamp vault and must not enter retained workflow data or observable command arguments.
- Reviews cover only the complete current active published semantic model, in bounded chunks, and remain coherent with one published revision.
- Archi owns formal ArchiMate lexicon and relationship validation. The extension assesses architectural quality and may suggest potential derived relationships only as advisory findings.
- Governed mutation is deferred until Archi Software Factory exposes a supported mutation contract.

## Deferred decisions

- Exact TypeScript model/workflow layout.
- Standalone workflow versus model-backed interactive workflow for multi-turn dialogue and durable status.
- Cross-revision recommendation comparison.
