import { z } from "npm:zod@4";
import {
  CitationSchema,
  DispositionSchema,
  ExpectedGroupsSchema,
  FindingCategorySchema,
  SPECIALIST_ORDER,
  SpecialistIdSchema,
} from "./schemas.ts";

/** The fixed additional lenses in persisted canonical order. */
export const LENS_ORDER = [
  "domain",
  "qualityAttribute",
  "deployment",
  "data",
  "security",
  "resilience",
  "governance",
  "organization",
] as const;
export const LensIdSchema = z.enum(LENS_ORDER);
export type LensId = z.infer<typeof LensIdSchema>;

export const LENS_DESCRIPTIONS: Record<LensId, string> = {
  domain: "Assess domain vocabulary, boundaries, ownership, and capability alignment.",
  qualityAttribute: "Assess explicit quality goals and their traceability to architecture decisions.",
  deployment: "Assess deployment nodes, locations, environments, and placement traceability.",
  data: "Assess data ownership, lifecycle, flows, and information responsibility.",
  security: "Assess security context, controls, trust boundaries, and risk traceability.",
  resilience: "Assess failure assumptions, recovery responsibilities, and continuity evidence.",
  governance: "Assess accountability, decision rights, standards, and compliance evidence.",
  organization: "Assess organizational roles, ownership, collaboration, and operating boundaries.",
};

export const LENS_LIMITATIONS: Record<LensId, string[]> = {
  domain: ["Does not validate domain correctness or business policy."],
  qualityAttribute: [
    "Does not perform quantitative performance or availability testing.",
  ],
  deployment: [
    "Does not inspect runtime infrastructure or deployment tooling.",
  ],
  data: ["Does not inspect data stores or unreferenced repositories."],
  security: ["Does not constitute a security audit or formal threat model."],
  resilience: ["Does not execute failure or recovery tests."],
  governance: ["Does not establish legal or regulatory compliance."],
  organization: ["Does not infer personnel facts absent model evidence."],
};

/** Machine-readable declaration retained in each V2 role snapshot. */
export interface LensDeclaration {
  readonly roleId: LensId;
  readonly requiredContextEvidenceKeys: readonly string[];
  readonly requiredEvaluatedEvidenceKeys: readonly string[];
  readonly concernEvidenceKeys: readonly string[];
  readonly contextTrigger: Predicate;
  readonly concernPredicate: Predicate;
  readonly limitations: readonly string[];
  readonly epistemicKind: "heuristic";
  readonly requiresCitations: true;
  readonly evaluatorVersion:
    | "lens/domain@1"
    | "lens/qualityAttribute@1"
    | "lens/deployment@1"
    | "lens/data@1"
    | "lens/security@1"
    | "lens/resilience@1"
    | "lens/governance@1"
    | "lens/organization@1";
}

export type Predicate =
  | { kind: "allOf"; children: Predicate[] }
  | { kind: "anyOf"; children: Predicate[] }
  | { kind: "not"; child: Predicate }
  | { kind: "present"; key: string }
  | { kind: "equals"; key: string; value: string | number | boolean | null }
  | { kind: "contains"; key: string; value: string }
  | { kind: "countAtLeast"; key: string; minimum: number };

const declarations: Record<LensId, LensDeclaration> = {
  domain: {
    roleId: "domain",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["domainSignals"],
    concernEvidenceKeys: ["domainSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "domainSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.domain,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/domain@1",
  },
  qualityAttribute: {
    roleId: "qualityAttribute",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["qualitySignals"],
    concernEvidenceKeys: ["qualitySignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "qualitySignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.qualityAttribute,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/qualityAttribute@1",
  },
  deployment: {
    roleId: "deployment",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["deploymentSignals"],
    concernEvidenceKeys: ["deploymentSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "deploymentSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.deployment,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/deployment@1",
  },
  data: {
    roleId: "data",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["dataSignals"],
    concernEvidenceKeys: ["dataSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "dataSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.data,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/data@1",
  },
  security: {
    roleId: "security",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["securitySignals"],
    concernEvidenceKeys: ["securitySignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "securitySignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.security,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/security@1",
  },
  resilience: {
    roleId: "resilience",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["resilienceSignals"],
    concernEvidenceKeys: ["resilienceSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "resilienceSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.resilience,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/resilience@1",
  },
  governance: {
    roleId: "governance",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["governanceSignals"],
    concernEvidenceKeys: ["governanceSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "governanceSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.governance,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/governance@1",
  },
  organization: {
    roleId: "organization",
    requiredContextEvidenceKeys: ["elements"],
    requiredEvaluatedEvidenceKeys: ["organizationSignals"],
    concernEvidenceKeys: ["organizationSignals"],
    contextTrigger: { kind: "countAtLeast", key: "elements", minimum: 1 },
    concernPredicate: { kind: "countAtLeast", key: "organizationSignals", minimum: 1 },
    limitations: LENS_LIMITATIONS.organization,
    epistemicKind: "heuristic",
    requiresCitations: true,
    evaluatorVersion: "lens/organization@1",
  },
};

function predicateKeys(predicate: Predicate): string[] {
  if (predicate.kind === "allOf" || predicate.kind === "anyOf") {
    return predicate.children.flatMap(predicateKeys);
  }
  if (predicate.kind === "not") return predicateKeys(predicate.child);
  return [predicate.key];
}
function canonicalUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length &&
    values.join("\u0000") === [...values].sort((a, b) => a.localeCompare(b)).join("\u0000");
}

/** Validate a lens declaration before it can be snapshotted or evaluated. */
export function validateLensDeclaration(declaration: LensDeclaration): void {
  const contextKeys = declaration.requiredContextEvidenceKeys;
  const evaluatedKeys = declaration.requiredEvaluatedEvidenceKeys;
  if (
    !canonicalUnique(contextKeys) || !canonicalUnique(evaluatedKeys) ||
    !canonicalUnique(declaration.concernEvidenceKeys)
  ) {
    throw new Error("lens evidence declarations must be unique and canonically sorted");
  }
  if (contextKeys.some((key) => evaluatedKeys.includes(key))) {
    throw new Error("lens context and evaluated evidence keys must be disjoint");
  }
  const undeclaredContext = predicateKeys(declaration.contextTrigger).filter((key) => !contextKeys.includes(key));
  const undeclaredConcern = predicateKeys(declaration.concernPredicate).filter((key) => !evaluatedKeys.includes(key));
  if (undeclaredContext.length > 0 || undeclaredConcern.length > 0) {
    throw new Error("lens predicates may reference only their declared evidence keys");
  }
  if (declaration.concernEvidenceKeys.some((key) => !evaluatedKeys.includes(key))) {
    throw new Error("lens concern evidence must be required evaluated evidence");
  }
}

/** Return a defensive authoritative declaration, never a mutable registry entry. */
export function lensDeclaration(id: LensId): LensDeclaration {
  const declaration = declarations[id];
  validateLensDeclaration(declaration);
  return structuredClone(declaration);
}

const SPECIALIST_LIMITATIONS: Record<string, string[]> = Object.fromEntries(
  SPECIALIST_ORDER.map((
    role,
  ) => [role, [
    "Interpretation remains advisory; formal ArchiMate validation is outside this role.",
  ]]),
);
export interface SpecialistDeclaration {
  roleId: z.infer<typeof SpecialistIdSchema>;
  requiredEvidenceKeys: readonly string[];
  limitations: readonly string[];
  evaluatorVersion: string;
}
export function specialistDeclaration(
  id: z.infer<typeof SpecialistIdSchema>,
): SpecialistDeclaration {
  if (!SPECIALIST_ORDER.includes(id)) throw new Error("unknown specialist");
  return {
    roleId: id,
    requiredEvidenceKeys: ["elements"],
    limitations: [...(SPECIALIST_LIMITATIONS[id] ?? [])],
    evaluatorVersion: `specialist/${id}@1`,
  };
}

/** Canonical combined role order used by snapshots and assessment records. */
export function canonicalRoles(
  specialists: readonly string[] | undefined,
  lenses: readonly string[] | undefined,
): { specialists: z.infer<typeof SpecialistIdSchema>[]; lenses: LensId[] } {
  const specialistValues = specialists ?? SPECIALIST_ORDER;
  const lensValues = lenses ?? [];
  if (
    new Set(specialistValues).size !== specialistValues.length ||
    new Set(lensValues).size !== lensValues.length
  ) {
    throw new Error("selection contains duplicate roles");
  }
  const specialistSet = new Set(specialistValues);
  const lensSet = new Set(lensValues);
  if (
    ![...specialistSet].every((value) => SpecialistIdSchema.safeParse(value).success)
  ) {
    throw new Error("selection contains an unknown specialist");
  }
  if (![...lensSet].every((value) => LensIdSchema.safeParse(value).success)) {
    throw new Error("selection contains an unknown lens");
  }
  const selectedSpecialists = SPECIALIST_ORDER.filter((value) => specialistSet.has(value));
  const selectedLenses = LENS_ORDER.filter((value) => lensSet.has(value));
  if (selectedSpecialists.length + selectedLenses.length === 0) {
    throw new Error("at least one specialist or lens must be selected");
  }
  return { specialists: selectedSpecialists, lenses: selectedLenses };
}

export type TriState = "true" | "false" | "unavailable";
export type Evidence = Record<string, unknown>;

/** Evaluate a declaration predicate without coercing unavailable data to false. */
export function evaluatePredicate(
  predicate: Predicate,
  evidence: Evidence,
): TriState {
  if (predicate.kind === "allOf") {
    const values = predicate.children.map((child) => evaluatePredicate(child, evidence));
    if (values.includes("false")) return "false";
    if (values.includes("unavailable")) return "unavailable";
    return "true";
  }
  if (predicate.kind === "anyOf") {
    const values = predicate.children.map((child) => evaluatePredicate(child, evidence));
    if (values.includes("true")) return "true";
    if (values.includes("unavailable")) return "unavailable";
    return "false";
  }
  if (predicate.kind === "not") {
    const value = evaluatePredicate(predicate.child, evidence);
    return value === "true" ? "false" : value === "false" ? "true" : "unavailable";
  }
  if (!(predicate.key in evidence) || evidence[predicate.key] === undefined) {
    return "unavailable";
  }
  const value = evidence[predicate.key];
  if (predicate.kind === "present") return value === null ? "false" : "true";
  if (predicate.kind === "equals") {
    return value === predicate.value ? "true" : "false";
  }
  if (predicate.kind === "contains") {
    return typeof value === "string" && value.includes(predicate.value) ? "true" : "false";
  }
  if (predicate.kind === "countAtLeast") {
    return Array.isArray(value) && value.length >= predicate.minimum ? "true" : "false";
  }
  return "unavailable";
}

function missingKeys(keys: readonly string[], evidence: Evidence): string[] {
  return [
    ...new Set(
      keys.filter((key) => !(key in evidence) || evidence[key] === undefined),
    ),
  ].sort();
}

function expectedEvidenceValue(key: string, value: unknown): boolean {
  // Complete-model collections and optional concern signal collections are
  // arrays. Null and wrong-type values are malformed, not false predicates.
  return key === "elements" || key.endsWith("Signals") ? Array.isArray(value) : true;
}
function malformedKeys(keys: readonly string[], evidence: Evidence): string[] {
  return [
    ...new Set(
      keys.filter((key) =>
        key in evidence && evidence[key] !== undefined &&
        (evidence[key] === null || !expectedEvidenceValue(key, evidence[key]))
      ),
    ),
  ].sort();
}
function markerValues(value: unknown): string[] {
  if (typeof value === "string") return value.split(/[\s,;]+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return [];
}
function markedForLens(item: Record<string, unknown>, id: LensId): boolean {
  const properties = item.properties && typeof item.properties === "object" && !Array.isArray(item.properties)
    ? item.properties as Record<string, unknown>
    : {};
  const markers = [
    item.architectureReviewLens,
    item.reviewLens,
    properties.architectureReviewLens,
    properties.reviewLens,
  ].flatMap(markerValues).map((value) => value.toLowerCase());
  return markers.includes(id.toLowerCase());
}

/** Derive immutable lens concern inputs only from the persisted Archi evidence. */
export function deriveLensEvidence(evidence: Evidence): Evidence {
  const derived: Evidence = { ...evidence };
  const records = ["folders", "elements", "relationships"].flatMap((key) =>
    Array.isArray(evidence[key]) ? evidence[key] as unknown[] : []
  ).filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
  for (const id of LENS_ORDER) {
    const signalKey = lensDeclaration(id).concernEvidenceKeys[0]!;
    const marked = records.filter((item) => markedForLens(item, id));
    derived[signalKey] = marked.some((item) => typeof item.canonicalId !== "string" || item.canonicalId.length === 0)
      ? null
      : marked;
  }
  return derived;
}

export interface ApplicabilityResult {
  applicability: "applicable" | "not-applicable" | "insufficient-evidence";
  rationale: string;
  checkedEvidenceKeys: string[];
  missingEvidenceKeys: string[];
  evaluatedEvidenceKeys: string[];
  findingsAllowed: boolean;
  concernMatched: boolean;
}

/** Total applicability: required inputs are preflighted before predicate evaluation. */
export function classifyLens(
  id: LensId,
  evidence: Evidence,
): ApplicabilityResult {
  const declaration = declarations[id];
  const contextMissing = missingKeys(
    declaration.requiredContextEvidenceKeys,
    evidence,
  );
  const contextMalformed = malformedKeys(
    declaration.requiredContextEvidenceKeys,
    evidence,
  );
  if (contextMissing.length > 0 || contextMalformed.length > 0) {
    return {
      applicability: "insufficient-evidence",
      rationale: contextMalformed.length > 0
        ? "required context evidence is malformed"
        : "required context evidence is unavailable",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: [
        ...new Set([...contextMissing, ...contextMalformed]),
      ].sort(),
      evaluatedEvidenceKeys: [],
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  // Malformed concern evidence is always insufficient, even when the context
  // is empty: silently ignoring an invalid supplied signal would hide bad data.
  const preflightConcernMalformed = malformedKeys(
    declaration.concernEvidenceKeys,
    evidence,
  );
  if (preflightConcernMalformed.length > 0) {
    return {
      applicability: "insufficient-evidence",
      rationale: "concern evidence is malformed",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: preflightConcernMalformed,
      evaluatedEvidenceKeys: [],
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  const context = evaluatePredicate(declaration.contextTrigger, evidence);
  if (context === "false") {
    return {
      applicability: "not-applicable",
      rationale: "declared context trigger is false",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: [],
      evaluatedEvidenceKeys: [],
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  if (context === "unavailable") {
    return {
      applicability: "insufficient-evidence",
      rationale: "context trigger is unavailable",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      evaluatedEvidenceKeys: [],
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  const evaluatedKeys = [
    ...new Set([
      ...declaration.requiredEvaluatedEvidenceKeys,
      ...declaration.concernEvidenceKeys,
    ]),
  ]
    .sort();
  const evaluatedMissing = missingKeys(
    declaration.requiredEvaluatedEvidenceKeys,
    evidence,
  );
  const evaluatedMalformed = malformedKeys(
    declaration.requiredEvaluatedEvidenceKeys,
    evidence,
  );
  const concernMalformed = malformedKeys(
    declaration.concernEvidenceKeys,
    evidence,
  );
  if (
    evaluatedMissing.length > 0 || evaluatedMalformed.length > 0 ||
    concernMalformed.length > 0
  ) {
    return {
      applicability: "insufficient-evidence",
      rationale: evaluatedMalformed.length > 0 || concernMalformed.length > 0
        ? "required evaluated evidence is malformed"
        : "required evaluated evidence is unavailable",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: [
        ...new Set([
          ...evaluatedMissing,
          ...evaluatedMalformed,
          ...concernMalformed,
        ]),
      ].sort(),
      evaluatedEvidenceKeys: evaluatedKeys,
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  const concern = evaluatePredicate(declaration.concernPredicate, evidence);
  if (concern === "unavailable") {
    const concernMissing = missingKeys(
      predicateKeys(declaration.concernPredicate),
      evidence,
    );
    const concernMalformed = malformedKeys(
      predicateKeys(declaration.concernPredicate),
      evidence,
    );
    if (concernMalformed.length > 0) {
      return {
        applicability: "insufficient-evidence",
        rationale: "concern evidence is malformed",
        checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys]
          .sort(),
        missingEvidenceKeys: concernMalformed,
        evaluatedEvidenceKeys: evaluatedKeys,
        findingsAllowed: false,
        concernMatched: false,
      };
    }
    if (concernMissing.length > 0) {
      return {
        applicability: "insufficient-evidence",
        rationale: "required evaluated evidence is unavailable",
        checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
        missingEvidenceKeys: concernMissing,
        evaluatedEvidenceKeys: evaluatedKeys,
        findingsAllowed: false,
        concernMatched: false,
      };
    }
    return {
      applicability: "insufficient-evidence",
      rationale: "concern evidence is unavailable",
      checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
      missingEvidenceKeys: [],
      evaluatedEvidenceKeys: evaluatedKeys,
      findingsAllowed: false,
      concernMatched: false,
    };
  }
  const concernMatched = concern === "true";
  return {
    applicability: "applicable",
    rationale: concernMatched
      ? "declared concern predicate matched"
      : "context applies and no concern predicate matched",
    checkedEvidenceKeys: [...declaration.requiredContextEvidenceKeys].sort(),
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: evaluatedKeys,
    findingsAllowed: concernMatched,
    concernMatched,
  };
}

// Components retain RFC-3986 unreserved ASCII and use uppercase percent-hex escapes.
export const QF2_PATTERN =
  /^qf2:(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+:(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+:(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+$/;
function qfComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
/** Collision-safe qualified finding identity. */
export function qualifiedFindingKey(
  roleKind: "specialist" | "lens",
  roleId: string,
  localFindingId: string,
): string {
  return `qf2:${qfComponent(roleKind)}:${qfComponent(roleId)}:${qfComponent(localFindingId)}`;
}

export const RoleKindSchema = z.enum(["specialist", "lens"]);
const Qf2Schema = z.string().regex(QF2_PATTERN);
export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("allOf"), children: z.array(PredicateSchema) })
      .strict(),
    z.object({ kind: z.literal("anyOf"), children: z.array(PredicateSchema) })
      .strict(),
    z.object({ kind: z.literal("not"), child: PredicateSchema }).strict(),
    z.object({ kind: z.literal("present"), key: z.string().min(1) }).strict(),
    z.object({
      kind: z.literal("equals"),
      key: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }).strict(),
    z.object({
      kind: z.literal("contains"),
      key: z.string().min(1),
      value: z.string(),
    }).strict(),
    z.object({
      kind: z.literal("countAtLeast"),
      key: z.string().min(1),
      minimum: z.number().int().positive(),
    })
      .strict(),
  ])
) as z.ZodType<Predicate>;
const DigestSchema = z.string().regex(/^sha256-[a-f0-9]{64}$/);
export const RoleSnapshotSchema = z.union([
  z.object({
    roleKind: z.literal("specialist"),
    roleId: SpecialistIdSchema,
    definitionVersion: z.literal(1),
    snapshotDigest: DigestSchema,
    evaluatorVersion: z.string().regex(/^specialist\/.+@1$/),
    definitionSnapshot: z.object({
      kind: z.literal("specialist"),
      requiredEvidenceKeys: z.array(z.string()),
      limitations: z.array(z.string().min(1)),
      applicability: z.object({ kind: z.literal("always") }).strict(),
    }).strict(),
  }).strict(),
  z.object({
    roleKind: z.literal("lens"),
    roleId: LensIdSchema,
    definitionVersion: z.literal(1),
    snapshotDigest: DigestSchema,
    evaluatorVersion: z.string().regex(/^lens\/.+@1$/),
    definitionSnapshot: z.object({
      kind: z.literal("lens"),
      requiredContextEvidenceKeys: z.array(z.string()),
      requiredEvaluatedEvidenceKeys: z.array(z.string()),
      contextTrigger: PredicateSchema,
      concernPredicate: PredicateSchema,
      limitations: z.array(z.string().min(1)),
    }).strict(),
  }).strict(),
]).superRefine((snapshot, context) => {
  const expectedEvaluator = `${snapshot.roleKind}/${snapshot.roleId}@1`;
  if (snapshot.evaluatorVersion !== expectedEvaluator) {
    context.addIssue({ code: "custom", message: "snapshot evaluator does not match its role" });
  }
  const definition = snapshot.definitionSnapshot;
  const arrays = definition.kind === "specialist" ? [definition.requiredEvidenceKeys, definition.limitations] : [
    definition.requiredContextEvidenceKeys,
    definition.requiredEvaluatedEvidenceKeys,
    definition.limitations,
  ];
  if (arrays.some((values) => !canonicalUnique(values))) {
    context.addIssue({
      code: "custom",
      message: "snapshot evidence and limitation arrays must be unique and canonically sorted",
    });
  }
  if (definition.kind === "lens") {
    if (
      definition.requiredContextEvidenceKeys.some((key) => definition.requiredEvaluatedEvidenceKeys.includes(key))
    ) {
      context.addIssue({ code: "custom", message: "snapshot context and evaluated evidence overlap" });
    }
    const undeclared = [
      ...predicateKeys(definition.contextTrigger).filter((key) =>
        !definition.requiredContextEvidenceKeys.includes(key)
      ),
      ...predicateKeys(definition.concernPredicate).filter((key) =>
        !definition.requiredEvaluatedEvidenceKeys.includes(key)
      ),
    ];
    if (undeclared.length > 0) {
      context.addIssue({ code: "custom", message: "snapshot predicates use undeclared evidence" });
    }
  }
});
export const RoleSnapshotRecordSchema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  snapshots: z.array(RoleSnapshotSchema),
  recordedAt: z.string().datetime(),
}).strict();
export const ReviewStateV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/),
  epoch: z.number().int().positive(),
  phase: z.enum([
    "collecting",
    "assessing",
    "synthesizing",
    "dialogue",
    "stopped",
    "complete",
  ]),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive().optional(),
  expectedGroups: ExpectedGroupsSchema,
  selectedSpecialists: z.array(SpecialistIdSchema),
  selectedLenses: z.array(LensIdSchema),
  roleSnapshotResourceName: z.string().min(1),
  updatedAt: z.string().datetime(),
}).strict().superRefine((state, context) => {
  if (state.selectedSpecialists.length + state.selectedLenses.length === 0) {
    context.addIssue({
      code: "custom",
      message: "combined v2 selection must be non-empty",
    });
    return;
  }
  if (
    state.roleSnapshotResourceName !==
      roleSnapshotResourceName(state.reviewId, state.epoch)
  ) {
    context.addIssue({
      code: "custom",
      message: "persisted v2 role snapshot resource name is invalid",
    });
  }
  try {
    const canonical = canonicalRoles(state.selectedSpecialists, state.selectedLenses);
    if (
      canonical.specialists.join("\u0000") !== state.selectedSpecialists.join("\u0000") ||
      canonical.lenses.join("\u0000") !== state.selectedLenses.join("\u0000")
    ) {
      context.addIssue({
        code: "custom",
        message: "persisted v2 role selection must be unique and canonical",
      });
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "invalid persisted v2 role selection",
    });
  }
});
export type ReviewStateV2 = z.infer<typeof ReviewStateV2Schema>;

/** Compute the canonical digest used to bind a persisted evaluator snapshot. */
export async function snapshotDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256-${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
export function roleSnapshotResourceName(
  reviewId: string,
  epoch: number,
): string {
  return `roleSnapshotsV2-${reviewId}-e${epoch}-s0`;
}
/** Build deterministic v2 snapshots for every selected specialist and lens. */
export async function roleSnapshots(
  specialists: readonly z.infer<typeof SpecialistIdSchema>[],
  lenses: readonly LensId[],
): Promise<z.infer<typeof RoleSnapshotSchema>[]> {
  const canonical = canonicalRoles(specialists, lenses);
  const specialistSnapshots = await Promise.all(
    canonical.specialists.map(async (role) => {
      const declaration = specialistDeclaration(role);
      const definitionSnapshot = {
        kind: "specialist" as const,
        requiredEvidenceKeys: [...declaration.requiredEvidenceKeys],
        limitations: [...declaration.limitations],
        applicability: { kind: "always" as const },
      };
      return {
        roleKind: "specialist" as const,
        roleId: role,
        definitionVersion: 1 as const,
        snapshotDigest: await snapshotDigest(definitionSnapshot),
        evaluatorVersion: `specialist/${role}@1`,
        definitionSnapshot,
      };
    }),
  );
  const lensSnapshots = await Promise.all(canonical.lenses.map(async (role) => {
    const declaration = lensDeclaration(role);
    const definitionSnapshot = {
      kind: "lens" as const,
      requiredContextEvidenceKeys: [...declaration.requiredContextEvidenceKeys],
      requiredEvaluatedEvidenceKeys: [
        ...declaration.requiredEvaluatedEvidenceKeys,
      ],
      contextTrigger: declaration.contextTrigger,
      concernPredicate: declaration.concernPredicate,
      limitations: [...declaration.limitations],
    };
    return {
      roleKind: "lens" as const,
      roleId: role,
      definitionVersion: 1 as const,
      snapshotDigest: await snapshotDigest(definitionSnapshot),
      evaluatorVersion: declaration.evaluatorVersion,
      definitionSnapshot,
    };
  }));
  return [...specialistSnapshots, ...lensSnapshots].map((snapshot) => RoleSnapshotSchema.parse(snapshot));
}
export const FindingV2Schema = z.object({
  findingKey: Qf2Schema,
  localFindingId: z.string().min(1),
  roleKind: RoleKindSchema,
  roleId: z.string().min(1),
  category: FindingCategorySchema,
  epistemicKind: z.enum(["factual", "heuristic"]),
  title: z.string().min(1),
  statement: z.string().min(1),
  canonicalIds: z.array(z.string().min(1)).min(1),
  citations: z.array(CitationSchema),
  confidence: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5).optional(),
  scope: z.number().int().min(1).max(5).optional(),
  effort: z.number().int().min(1).max(5).optional(),
  basis: z.array(z.string().min(1)).optional(),
  limitations: z.array(z.string().min(1)).optional(),
}).strict();
export const RoleAssessmentV2Schema = z.union([
  z.object({
    roleKind: z.literal("specialist"),
    roleId: SpecialistIdSchema,
    modelId: z.string().min(1),
    publishedRevision: z.number().int().positive(),
    definitionVersion: z.literal(1),
    evaluatorVersion: z.string(),
    snapshotDigest: DigestSchema,
    applicability: z.literal("applicable"),
    checkedEvidenceKeys: z.array(z.string()),
    missingEvidenceKeys: z.array(z.never()),
    evaluatedEvidenceKeys: z.array(z.string()),
    limitations: z.array(z.string()),
    findings: z.array(FindingV2Schema),
    strengths: z.array(z.string().min(1)),
    completedAt: z.string().datetime(),
  }).strict(),
  z.object({
    roleKind: z.literal("lens"),
    roleId: LensIdSchema,
    modelId: z.string().min(1),
    publishedRevision: z.number().int().positive(),
    definitionVersion: z.literal(1),
    evaluatorVersion: z.string(),
    snapshotDigest: DigestSchema,
    applicability: z.enum([
      "applicable",
      "not-applicable",
      "insufficient-evidence",
    ]),
    applicabilityRationale: z.string().min(1),
    checkedEvidenceKeys: z.array(z.string()),
    missingEvidenceKeys: z.array(z.string()),
    evaluatedEvidenceKeys: z.array(z.string()),
    limitations: z.array(z.string()),
    findings: z.array(FindingV2Schema),
    strengths: z.array(z.string().min(1)),
    completedAt: z.string().datetime(),
  }).strict(),
]);
export const AssessmentRecordV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  assessments: z.array(RoleAssessmentV2Schema),
  recordedAt: z.string().datetime(),
}).strict();
const EpistemicSchema = z.object({
  mode: z.enum(["factual", "heuristic", "mixed"]),
  factualSourceKeys: z.array(Qf2Schema),
  heuristicSourceKeys: z.array(Qf2Schema),
  basisSources: z.array(
    z.object({ qualifiedFindingKey: Qf2Schema, basis: z.string().min(1) })
      .strict(),
  ),
  limitationSources: z.array(
    z.object({ qualifiedFindingKey: Qf2Schema, limitation: z.string().min(1) })
      .strict(),
  ),
  limitations: z.array(z.string().min(1)),
}).strict();
export const RecommendationV2Schema = z.object({
  recommendationId: z.string().regex(/^r2-[0-9]{8}$/),
  title: z.string().min(1),
  statement: z.string().min(1),
  qualifiedSourceFindingKeys: z.array(Qf2Schema).min(1),
  citations: z.array(CitationSchema),
  impact: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
  scope: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  score: z.number().int().min(10).max(50),
  scoreExplanation: z.string().min(1),
  epistemic: EpistemicSchema,
}).strict();
export const SynthesisV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  orderedQualifiedFindingKeys: z.array(Qf2Schema),
  sourceReferenceCounts: z.array(
    z.object({
      qualifiedFindingKey: Qf2Schema,
      count: z.number().int().positive(),
    }).strict(),
  ),
  strengths: z.array(z.string().min(1)),
  recommendations: z.array(RecommendationV2Schema),
  synthesizedAt: z.string().datetime(),
}).strict();
export const FollowupV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().positive(),
  recommendationId: z.string().regex(/^r2-[0-9]{8}$/),
  roleKind: RoleKindSchema,
  roleId: z.string().min(1),
  question: z.string().min(1),
  response: z.string().min(1),
  recordedAt: z.string().datetime(),
}).strict();
export const DispositionV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  recommendationId: z.string().regex(/^r2-[0-9]{8}$/),
  roleKind: RoleKindSchema,
  roleId: z.string().min(1),
  disposition: DispositionSchema.shape.disposition,
  rationale: z.string().min(1).max(1000),
  recordedAt: z.string().datetime(),
}).strict();

/** Canonical recommendation identity is assigned before ranking. */
export function recommendationFingerprint(
  recommendation: z.input<typeof RecommendationV2Schema>,
): string {
  return JSON.stringify([
    recommendation.qualifiedSourceFindingKeys,
    recommendation.title,
    recommendation.statement,
  ]);
}

function compareRecommendationFingerprints(a: string, b: string): number {
  try {
    const left = JSON.parse(a) as unknown;
    const right = JSON.parse(b) as unknown;
    if (
      Array.isArray(left) && left.length === 3 && Array.isArray(left[0]) &&
      Array.isArray(right) && right.length === 3 && Array.isArray(right[0]) &&
      left[0].every((value) => typeof value === "string") &&
      right[0].every((value) => typeof value === "string") &&
      typeof left[1] === "string" && typeof left[2] === "string" &&
      typeof right[1] === "string" && typeof right[2] === "string"
    ) {
      const leftSources = left[0] as string[];
      const rightSources = right[0] as string[];
      for (let index = 0; index < Math.min(leftSources.length, rightSources.length); index++) {
        const order = leftSources[index]!.localeCompare(rightSources[index]!);
        if (order !== 0) return order;
      }
      return leftSources.length - rightSources.length ||
        left[1].localeCompare(right[1]) || left[2].localeCompare(right[2]);
    }
  } catch {
    // Keep the generic helper deterministic for non-recommendation test inputs.
  }
  return a.localeCompare(b);
}

/** Assign sequential IDs after canonical fingerprint ordering. */
export function canonicalRecommendationIds(
  fingerprints: readonly string[],
): Map<string, string> {
  const unique = new Set(fingerprints);
  if (unique.size !== fingerprints.length) {
    throw new Error("duplicate recommendation fingerprint");
  }
  const ordered = [...fingerprints].sort(compareRecommendationFingerprints);
  return new Map(
    ordered.map((fingerprint, index) => [
      fingerprint,
      `r2-${String(index + 1).padStart(8, "0")}`,
    ]),
  );
}

export function canonicalRecommendationId(
  fingerprint: string,
  orderedFingerprints: readonly string[],
): string {
  const ids = canonicalRecommendationIds(orderedFingerprints);
  const id = ids.get(fingerprint);
  if (!id) throw new Error("recommendation fingerprint is not in canonical set");
  return id;
}
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Validate exact qf2 coverage, derive epistemic data, score, then globally rank. */
export function validateV2Synthesis(
  assessments: readonly z.infer<typeof RoleAssessmentV2Schema>[],
  synthesis: z.input<typeof SynthesisV2Schema>,
): z.infer<typeof SynthesisV2Schema> {
  const parsed = SynthesisV2Schema.parse(synthesis);
  const findings = assessments.flatMap((assessment) => assessment.findings);
  const findingByKey = new Map<string, z.infer<typeof FindingV2Schema>>();
  for (const finding of findings) {
    const expectedKey = qualifiedFindingKey(
      finding.roleKind,
      finding.roleId,
      finding.localFindingId,
    );
    if (finding.findingKey !== expectedKey) {
      throw new Error(
        "V2 finding key does not match role and local finding identity",
      );
    }
    if (findingByKey.has(finding.findingKey)) {
      throw new Error("duplicate V2 finding key");
    }
    if (finding.roleKind === "lens") {
      const declaration = lensDeclaration(finding.roleId as LensId);
      if (
        finding.epistemicKind !== declaration.epistemicKind ||
        finding.citations.length === 0 ||
        !finding.basis?.length || !finding.limitations?.length
      ) {
        throw new Error(
          "V2 lens finding violates authoritative heuristic epistemic requirements",
        );
      }
    }
    findingByKey.set(finding.findingKey, finding);
  }
  const expected = findings.map((finding) => finding.findingKey);
  if (
    new Set(expected).size !== expected.length ||
    parsed.orderedQualifiedFindingKeys.join("\u0000") !==
      expected.join("\u0000")
  ) {
    throw new Error(
      "V2 synthesis ordered finding coverage does not match assessments",
    );
  }
  const recommendationFingerprints = parsed.recommendations.map(
    recommendationFingerprint,
  );
  const canonicalIds = canonicalRecommendationIds(recommendationFingerprints);
  const fingerprints = new Set<string>();
  const derived: z.infer<typeof RecommendationV2Schema>[] = [];
  for (const [index, recommendation] of parsed.recommendations.entries()) {
    if (
      new Set(recommendation.qualifiedSourceFindingKeys).size !==
        recommendation.qualifiedSourceFindingKeys.length
    ) {
      throw new Error("V2 recommendation repeats a source finding");
    }
    for (const key of recommendation.qualifiedSourceFindingKeys) {
      if (!findingByKey.has(key)) {
        throw new Error("V2 recommendation references an unknown finding");
      }
    }
    const fingerprint = recommendationFingerprints[index]!;
    if (fingerprints.has(fingerprint)) {
      throw new Error("duplicate V2 recommendation fingerprint");
    }
    fingerprints.add(fingerprint);
    const expectedId = canonicalIds.get(fingerprint)!;
    if (recommendation.recommendationId !== expectedId) {
      throw new Error(
        "V2 recommendation ID does not match canonical fingerprint ordering",
      );
    }
    const sources = recommendation.qualifiedSourceFindingKeys.map((key) => findingByKey.get(key)!);
    const confidence = Math.max(
      1,
      Math.min(
        5,
        Math.round(
          sources.reduce((sum, finding) => sum + finding.confidence, 0) /
            sources.length,
        ),
      ),
    );
    const factualSourceKeys = sortedUnique(
      sources.filter((finding) => finding.epistemicKind === "factual").map((
        finding,
      ) => finding.findingKey),
    );
    const heuristicSourceKeys = sortedUnique(
      sources.filter((finding) => finding.epistemicKind === "heuristic").map((
        finding,
      ) => finding.findingKey),
    );
    const basisSources = [...new Map(
      sources.filter((finding) => finding.epistemicKind === "heuristic").flatMap((finding) =>
        (finding.basis ?? []).map((basis) => ({
          qualifiedFindingKey: finding.findingKey,
          basis,
        }))
      ).map((entry) => [`${entry.qualifiedFindingKey}\u0000${entry.basis}`, entry]),
    ).values()].sort((a, b) =>
      a.qualifiedFindingKey.localeCompare(b.qualifiedFindingKey) || a.basis.localeCompare(b.basis)
    );
    const limitationSources = [
      ...new Map(
        sources.flatMap((finding) =>
          (finding.limitations ?? []).map((limitation) => ({
            qualifiedFindingKey: finding.findingKey,
            limitation,
          }))
        ).map((entry) => [`${entry.qualifiedFindingKey}\u0000${entry.limitation}`, entry]),
      ).values(),
    ].sort((a, b) =>
      a.qualifiedFindingKey.localeCompare(b.qualifiedFindingKey) || a.limitation.localeCompare(b.limitation)
    );
    const limitations = sortedUnique(
      sources.flatMap((finding) => finding.limitations ?? []),
    );
    const mode = factualSourceKeys.length && heuristicSourceKeys.length
      ? "mixed"
      : factualSourceKeys.length
      ? "factual"
      : "heuristic";
    const score = recommendation.impact * 4 + confidence * 3 +
      recommendation.scope * 2 + (6 - recommendation.effort);
    const epistemic = {
      mode,
      factualSourceKeys,
      heuristicSourceKeys,
      basisSources,
      limitationSources,
      limitations,
    };
    if (
      recommendation.confidence !== confidence || recommendation.score !== score
    ) {
      throw new Error(
        "V2 recommendation score/confidence must be recomputed deterministically",
      );
    }
    derived.push(
      RecommendationV2Schema.parse({
        ...recommendation,
        confidence,
        score,
        scoreExplanation:
          `impact(${recommendation.impact})*4 + confidence(${confidence})*3 + scope(${recommendation.scope})*2 + (6-effort(${recommendation.effort})) = ${score}`,
        epistemic,
      }),
    );
  }
  const flattened = derived.flatMap((recommendation) => recommendation.qualifiedSourceFindingKeys);
  const counts = new Map<string, number>();
  for (const key of flattened) counts.set(key, (counts.get(key) ?? 0) + 1);
  const expectedCounts = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map((
    [qualifiedFindingKey, count],
  ) => ({ qualifiedFindingKey, count }));
  if (
    JSON.stringify(parsed.sourceReferenceCounts) !==
      JSON.stringify(expectedCounts) ||
    expectedCounts.length !== expected.length ||
    expected.some((key) => !counts.has(key))
  ) throw new Error("V2 synthesis source reference multiset is incomplete");
  const recommendations = [...derived].sort((a, b) =>
    b.score - a.score ||
    a.qualifiedSourceFindingKeys.join("\u0000").localeCompare(
      b.qualifiedSourceFindingKeys.join("\u0000"),
    ) ||
    a.title.localeCompare(b.title) || a.statement.localeCompare(b.statement)
  );
  return SynthesisV2Schema.parse({ ...parsed, recommendations });
}
