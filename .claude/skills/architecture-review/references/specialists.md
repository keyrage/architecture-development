# Specialist roles

| ID | Description |
| --- | --- |
| `completeness` | Find missing concepts and assess coverage of the active semantic model; expected groups affect gap judgments. |
| `crossLayerTraceability` | Assess whether present and expected groups form understandable end-to-end architecture. |
| `documentationClarity` | Assess names, documentation, responsibilities, boundaries, and ambiguity. |
| `motivationStrategy` | Assess stakeholders, drivers, assessments, goals, outcomes, principles, requirements, constraints, capabilities, resources, and courses of action. |
| `repositoryAlignment` | Compare executable-design references with the referenced project evidence; no references means not assessable. |
| `derivedRelationships` | Identify advisory, confidence-rated derived relationships worth considering; never call these validation errors. |

Run only the confirmed non-empty subset. Parallel subagents are an optimization; sequential fallback has identical schemas and ordering. Each role records all findings, categorized as observation, interpretation, assumption, or recommendation, with canonical IDs and applicable citations.
