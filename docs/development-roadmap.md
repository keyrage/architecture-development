# Architecture-development extension roadmap

## Vision

`@keyrage/architecture-development` will help a human and AI agents collaboratively understand, review, and evolve software and system architecture represented in ArchiMate 3.2.

The extension is an agent-guidance and orchestration layer. Archi Software Factory remains responsible for the authoritative model and for validating ArchiMate syntax and allowed relationships. The extension must use stable plug-in interfaces rather than plug-in Java internals or the physical Memgraph schema.

## Product principles

1. Deliver small, demonstrable user outcomes.
2. Begin with the current active published semantic model; do not assess diagrams, layout, tombstones, or model history.
3. Review the complete model in bounded chunks. Never silently sample it.
4. Begin with an independent assessment, then use dialogue to test interpretations and shape recommendations.
5. Understand every ArchiMate 3.2 element and relationship type without duplicating Archi's formal model validation.
6. Distinguish observations, interpretations, assumptions, and recommendations.
7. Ground model-specific claims in canonical model identifiers and one published revision.
8. Ask before any future model mutation and use only a governed plug-in mutation interface.
9. Keep credentials in a Swamp vault and out of workflow inputs, arguments, records, reports, logs, screenshots, and version control.
10. Show concise results in the agent UI. Create report files only when the user asks.

## Archi Software Factory boundary

The first releases consume the stable read-only interface delivered by Archi Software Factory TASK-31:

- Normative wire contract: `../archimate-software-factory/agent-query-contract/v1/openapi.json`
- Operational and security semantics: `../archimate-software-factory/docs/agent-model-query.md`
- Authoritative model semantics: `../archimate-software-factory/graph-contract/README.md`
- Reference client behavior: `../archimate-software-factory/examples/agent-model-query.py`

The service is available only while packaged Archi is running and exposes an ephemeral loopback endpoint. A human issues a model-scoped bearer identity in Archi. The extension stores that credential in a Swamp vault and requires the user to select a configured model at review startup.

The extension uses fixed HTTP operations for discovery, folders, elements, relationships, lookup, and traversal. It must not issue Cypher or use the human Memgraph credential. Although the API also exposes tombstones, revisions, and provenance, architecture assessments always review only the current active published model.

Every response identifies its published revision. A multi-request assessment must reject mixed-revision evidence. If the revision changes during collection, the workflow restarts automatically once; a second movement stops with an actionable retry request.

Governed mutation is not currently available. Archi Software Factory TASK-29 is planned work and is not an implementable contract. The extension must not fall back to legacy direct Bolt writes.

## Slice 1: whole-model read-only review

### User outcome

A user selects a configured model and expected ArchiMate groups. Specialist agents assess the complete active published semantic model, a synthesizer presents notable strengths and the ten highest-ranked recommendations, and the user explores and dispositions recommendations through dialogue. The extension makes no model changes.

### Startup

1. List models configured in the Swamp vault.
2. Require explicit model selection.
3. Ask which ArchiMate groups are expected, selecting Application and Technology by default:
   - Motivation
   - Strategy
   - Business
   - Application
   - Technology
   - Physical
   - Implementation & Migration
4. Discover and verify the selected model's API version, graph-contract version, model identity, capabilities, limits, and current published revision.

Expected groups affect completeness judgments: specialists assess every group present in the model, but absence is a potential gap only for a group the user marked as expected.

### Complete-model evidence collection

The extension retrieves the complete current active semantic model using bounded pagination and chunking. It does not silently truncate or sample. Every evidence chunk retains the model ID and published revision.

A specialist may inspect files in the current project repository only when they are referenced by the model through the Archi Software Factory executable-design vocabulary. The user may add repository paths later during dialogue. Initial assessment does not prompt for extra paths.

### Specialist assessments

Use separate roles for:

1. **Model completeness and missing concepts** — assess internal completeness and infer missing real-world concepts from model semantics and allowed repository evidence.
2. **Cross-layer traceability** — assess whether present and expected groups form an understandable end-to-end architecture.
3. **Documentation and semantic clarity** — assess names, documentation, responsibilities, boundaries, and ambiguity.
4. **Motivation and strategy traceability** — assess stakeholders, drivers, assessments, goals, outcomes, principles, requirements, constraints, capabilities, resources, and courses of action.
5. **Architecture-to-repository alignment** — compare executable-design references with the referenced project evidence. If no references exist, report the lens as not assessable rather than as a defect.
6. **Potential derived relationships** — identify advisory, confidence-rated derived relationships worth considering. These are suggestions, not deterministic validation findings.

The coding-agent harness should run specialists as parallel subagents when that capability exists and expose progress according to its own UI conventions. Without subagent support, run the same specialist roles sequentially.

Every specialist records all findings without a fixed count limit. Repository-backed findings cite canonical model IDs and exact repository paths and line ranges.

### Synthesis and initial presentation

A synthesizing role deduplicates findings and globally ranks recommendations. There is no quota per specialist and no critical/high/medium/low label.

Ranking combines:

- architectural impact;
- confidence;
- affected scope; and
- remediation effort.

The score and its explanation remain visible. The initial agent-UI response presents notable strengths and the globally ranked top ten recommendations. All findings and recommendations remain available in the durable record.

### Dialogue

The user chooses which recommendation to discuss rather than following ranking order. The workflow may re-engage the relevant specialist for deeper analysis.

Recommendations may include both conceptual improvements and concrete proposed ArchiMate elements, relationships, names, and documentation. The workflow records a concise rationale and one disposition for each discussed recommendation:

- accepted;
- rejected;
- deferred;
- needs investigation; or
- undecided.

The user may stop at any time. Undiscussed recommendations remain undecided and the review can be resumed. If the model's published revision has changed, resumption requires a fresh assessment while preserving the earlier review as history. Comparing recommendations across revisions is deferred.

### Durable review contract

The Swamp record retains:

- selected model identity and expected groups;
- API and graph-contract versions;
- reviewed published revision;
- evidence-collection completeness and restart diagnostics;
- each specialist's original complete findings;
- the complete deduplicated recommendation set;
- ranking scores and explanations;
- notable strengths;
- dialogue state, dispositions, and concise rationale summaries; and
- repository citations where applicable.

No credential or secret-derived value may enter the durable record. A human-readable report stays in the agent UI unless the user explicitly requests a file export. Machine-readable review and accepted-recommendation data remain available through Swamp records.

### Deliberate exclusions

The first slice does not:

- mutate the model;
- duplicate Archi's ArchiMate lexicon or relationship validation;
- assess diagrams, views, viewpoints, or layout;
- assess tombstones, revision history, provenance, or unpublished local edits;
- silently sample large models;
- inspect unreferenced repository content during the initial assessment;
- compare recommendations across published revisions; or
- require packaged-Archi end-to-end acceptance testing.

### Synthetic acceptance coverage

Synthetic contract and workflow tests cover:

- model selection from vault-backed configuration;
- secret non-retention;
- discovery and unsupported contract behavior;
- complete pagination and bounded chunk processing;
- one automatic restart followed by fail-closed behavior on repeated revision movement;
- all ArchiMate 3.2 element and relationship types as review inputs;
- expected-group defaults and absence semantics;
- parallel specialist and sequential fallback behavior;
- preservation of original and synthesized findings;
- ranking and top-ten presentation;
- model and repository evidence citations;
- repository-not-assessable behavior;
- dialogue, specialist follow-up, dispositions, stopping, and resumption; and
- forced fresh assessment after revision movement.

## Subsequent vertical slices

### Slice 2: richer review lenses

Add independently testable, configurable lenses for deeper domain, quality-attribute, deployment, data, security, resilience, governance, and organization concerns. Preserve the same complete-evidence, specialist, synthesis, dialogue, and provenance contracts.

### Slice 3: structured model-change proposals

Turn accepted recommendations into a machine-readable, human-reviewed proposal containing intended additions, updates, removals, canonical targets, proposed ArchiMate types and relationships, rationale, assumptions, and expected baseline revision. The slice exports proposals but remains read-only.

### Slice 4: user-approved governed mutation

After Archi Software Factory exposes a supported governed mutation contract, submit explicitly approved proposals through that interface. Require user confirmation, optimistic concurrency, actor identity, rationale, complete audit provenance, and all-or-nothing failure behavior. Never fall back to direct Bolt writes.

### Slice 5: architecture-guided software delivery

Provide selected current architecture context to planning and implementation workflows. Support impact analysis, architecture-alignment checks, and executable-design vocabulary validation while preserving links from delivery decisions to the reviewed model revision and canonical IDs.

## Packaging direction

The extension will use the scoped registry name `@keyrage/architecture-development`. The first slice must establish only the package components required by its user outcome: manifest, agent skill/guidance, vault contract, stable query adapter, review orchestration/state, durable schemas, tests, and concise operator documentation.

The exact choice of standalone Swamp workflow or model-backed interactive workflow remains an implementation decision to resolve against the installed Swamp schemas. The generic `@adam/software-factory` model is used to develop this repository and must not be confused with the end-user architecture-review workflow.
