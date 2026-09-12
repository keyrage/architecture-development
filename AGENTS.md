# Architecture Development — Agent Guidance

## Purpose

Develop the `architecture-development` Swamp extension. The extension will guide AI agents through architecture-development work and provide the extension-facing interface to the Archi model used by the Archi Software Factory.

## Repository boundaries

- This is a separate git repository under the parent `archi-software-factory` directory.
- Keep this repository distinct from `../archimate-software-factory`, which contains the Archi plug-in/application implementation.
- Do not modify sibling repositories unless the user explicitly asks.
- Treat Swamp used to develop this repository as distinct from the Swamp extension being built here.
- `.swamp/` is local runtime state and must remain uncommitted.

## Swamp software factory

- The local factory instance is `architecture-development-factory`.
- Its definition is tracked at `models/@adam/software-factory/architecture-development-factory.yaml`.
- Use `swamp model method run architecture-development-factory status --input workItem=<task>` to resume existing work.
- Never satisfy human approval gates without explicit human instruction.
- Validate factory changes with `swamp model method run architecture-development-factory validate`.

## Development notes

- Use Backlog.md for planned extension work.
- Keep extension contracts, Archi model interface assumptions, and agent guidance explicit in plans and documentation.
- Prefer small, independently verifiable changes.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.51.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
