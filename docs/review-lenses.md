# Configurable review lenses

TASK-2.2 adds eight fixed, independently selectable lenses to the six TASK-2.1 specialists: `domain`,
`qualityAttribute`, `deployment`, `data`, `security`, `resilience`, `governance`, and `organization`.

The catalog is authoritative in `extensions/models/architecture-development/_lib/lenses.ts`. It declares each lens
description, required evidence, applicability predicate, evaluator version, and limitations. It is deliberately not a
plug-in framework and accepts no user executable code.

## Selection and epochs

A v2 review uses presence-sensitive selection defaults:

- neither selection field: all six specialists, no additional lenses;
- specialists only: the supplied specialists and no lenses;
- lenses only: the intended contract is no specialists and the supplied lenses, but the current public V2 start
  incorrectly adds all six specialists when `selectedSpecialists` is omitted. Until TASK-2.6 fixes this, callers
  **must explicitly send `selectedSpecialists: []`** with `selectedLenses`; omitting it is not lens-only;
- both fields: exactly the supplied sets.

The combined selection must be non-empty. Canonical order is the six specialists followed by the eight lenses. The
selected role declarations and evaluator versions are snapshotted into the review epoch. Resume uses that persisted
snapshot and fails closed if the evaluator cannot be matched.

For a lens-only review, use this **explicit-empty workaround** on the public `start_review` method:

```json
{"schemaVersion":2,"reviewId":"domain-review","selectedSpecialists":[],"selectedLenses":["domain"]}
```

Check the returned `selectedSpecialists` is empty before continuing. Omitting that field currently runs all six
specialists as well: this increases review/agent usage and findings, can displace lens recommendations in the global
top ten, and persists the unintended selection in state and epoch snapshots (including on resume). The approved
presence-sensitive default requires an omitted specialist field to mean empty when lenses are supplied. The user
explicitly accepted this temporary contract deviation for TASK-2.2; TASK-2.6 tracks the behavior fix. Do not silently
add the workaround to mixed-role or default selections.

## Applicability

Applicability is tri-state and never treats unavailable data as false:

- `applicable`: required context and evaluated evidence are available;
- `not-applicable`: complete context evidence proves the concern does not apply;
- `insufficient-evidence`: required context or evaluated evidence is missing, inaccessible, or malformed.

An applicable lens produces exactly zero findings when no concern is present. This is distinct from `not-applicable` and
from insufficient evidence, so an absent concern is not silently reported as a defect.

Concern evidence is derived only from the persisted Archi folders, elements, and relationships. A record opts into one
or more lens evaluators through an `architectureReviewLens` (or compatibility alias `reviewLens`) field, either on the
record or in its `properties` object. The value is a lens ID, a comma/semicolon/whitespace-separated list, or an array
of lens IDs. A marked record without a non-empty `canonicalId` makes that lens insufficient-evidence rather than
silently disappearing. A matched lens must persist findings that cite and collectively cover all of its marked records;
unmarked contextual evidence must persist zero findings. This explicit marker seam avoids inferring defects from
vocabulary keywords or merely from a lens being applicable.

Every v2 finding carries factual/heuristic metadata, a qf2 qualified identity, canonical model IDs, and repository
citations where applicable. Synthesis checks ordered finding coverage and the complete recommendation source-reference
multiset before assigning deterministic `r2-########` recommendation IDs.

TASK-2.1 v1 resources remain strict, untagged, append-only records. The v2 contracts use separate versioned resource
names and never rewrite or reinterpret a v1 epoch.
