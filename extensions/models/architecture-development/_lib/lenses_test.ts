import { assertEquals, assertRejects } from "../_test/assert.ts";
import {
  canonicalRecommendationId,
  canonicalRecommendationIds,
  canonicalRoles,
  classifyLens,
  evaluatePredicate,
  LENS_ORDER,
  lensDeclaration,
  qualifiedFindingKey,
  recommendationFingerprint,
  validateV2Synthesis,
} from "./lenses.ts";

Deno.test("catalog exposes exactly the eight fixed lenses and declarations", () => {
  assertEquals(LENS_ORDER, [
    "domain",
    "qualityAttribute",
    "deployment",
    "data",
    "security",
    "resilience",
    "governance",
    "organization",
  ]);
  for (const id of LENS_ORDER) {
    const declaration = lensDeclaration(id);
    assertEquals(declaration.roleId, id);
    assertEquals(declaration.evaluatorVersion, `lens/${id}@1`);
    assertEquals(declaration.limitations.length > 0, true);
    assertEquals(
      declaration.requiredContextEvidenceKeys.some((key) => declaration.requiredEvaluatedEvidenceKeys.includes(key)),
      false,
    );
  }
});

Deno.test("selection defaults, mixed roles, duplicates, and empty combined selection", async () => {
  assertEquals(canonicalRoles(undefined, undefined), {
    specialists: [
      "completeness",
      "crossLayerTraceability",
      "documentationClarity",
      "motivationStrategy",
      "repositoryAlignment",
      "derivedRelationships",
    ],
    lenses: [],
  });
  assertEquals(canonicalRoles(["documentationClarity"], ["security", "domain"]), {
    specialists: ["documentationClarity"],
    lenses: ["domain", "security"],
  });
  await assertRejects(() => Promise.resolve(canonicalRoles([], [])), undefined, "at least one");
  await assertRejects(() => Promise.resolve(canonicalRoles(["bad"], [])), undefined, "unknown specialist");
});

Deno.test("tri-state predicate composition preserves unavailable evidence", () => {
  assertEquals(
    evaluatePredicate({
      kind: "allOf",
      children: [{ kind: "equals", key: "a", value: 1 }, { kind: "present", key: "missing" }],
    }, { a: 1 }),
    "unavailable",
  );
  assertEquals(
    evaluatePredicate({
      kind: "allOf",
      children: [{ kind: "equals", key: "a", value: 0 }, { kind: "present", key: "missing" }],
    }, { a: 1 }),
    "false",
  );
  assertEquals(
    evaluatePredicate({
      kind: "anyOf",
      children: [{ kind: "equals", key: "a", value: 1 }, { kind: "present", key: "missing" }],
    }, { a: 1 }),
    "true",
  );
  assertEquals(
    evaluatePredicate({
      kind: "anyOf",
      children: [{ kind: "equals", key: "a", value: 0 }, { kind: "present", key: "missing" }],
    }, { a: 1 }),
    "unavailable",
  );
});

Deno.test("each lens classifies all four evidence boundary states", () => {
  for (const id of LENS_ORDER) {
    const signalKey = id === "qualityAttribute" ? "qualitySignals" : `${id}Signals`;
    const insufficientMissing = classifyLens(id, {});
    assertEquals(insufficientMissing.applicability, "insufficient-evidence");
    assertEquals(insufficientMissing.findingsAllowed, false);

    const insufficientNull = classifyLens(id, { elements: null });
    assertEquals(insufficientNull.applicability, "insufficient-evidence");
    assertEquals(insufficientNull.findingsAllowed, false);

    const insufficientWrongType = classifyLens(id, { elements: "not-an-array" });
    assertEquals(insufficientWrongType.applicability, "insufficient-evidence");
    assertEquals(insufficientWrongType.findingsAllowed, false);

    const notApplicable = classifyLens(id, { elements: [], [signalKey]: [] });
    assertEquals(notApplicable.applicability, "not-applicable");
    assertEquals(notApplicable.findingsAllowed, false);

    const applicableZero = classifyLens(id, { elements: [{ canonicalId: "element-1" }], [signalKey]: [] });
    assertEquals(applicableZero.applicability, "applicable");
    assertEquals(applicableZero.findingsAllowed, false);
    assertEquals(applicableZero.concernMatched, false);

    const applicableWithFindings = classifyLens(id, {
      elements: [{ canonicalId: "element-1" }],
      [signalKey]: ["signal"],
    });
    assertEquals(applicableWithFindings.applicability, "applicable");
    assertEquals(applicableWithFindings.findingsAllowed, true);
    assertEquals(applicableWithFindings.concernMatched, true);

    assertEquals(
      classifyLens(id, { elements: [{ canonicalId: "element-1" }], [signalKey]: null }).applicability,
      "insufficient-evidence",
    );
    assertEquals(
      classifyLens(id, { elements: [{ canonicalId: "element-1" }], [signalKey]: { malformed: true } }).applicability,
      "insufficient-evidence",
    );
    assertEquals(lensDeclaration(id).epistemicKind, "heuristic");
    assertEquals(lensDeclaration(id).requiresCitations, true);
  }
});

Deno.test("qf2 identity is injective for roles and local IDs", () => {
  const a = qualifiedFindingKey("specialist", "completeness", "same:id");
  const b = qualifiedFindingKey("lens", "domain", "same:id");
  assertEquals(a === b, false);
  assertEquals(/^qf2:/.test(a), true);
  assertEquals(a.includes("%3A"), true);
});

function assessment(
  roleKind: "specialist",
  roleId: "completeness",
  key: string,
): ReturnType<typeof specialistAssessment>;
function assessment(roleKind: "lens", roleId: "domain", key: string): ReturnType<typeof lensAssessment>;
function assessment(roleKind: "specialist" | "lens", roleId: string, key: string) {
  return roleKind === "specialist"
    ? specialistAssessment(roleId as "completeness", key)
    : lensAssessment(roleId as "domain", key);
}
function finding(roleKind: "specialist" | "lens", roleId: string, key: string) {
  return {
    findingKey: key,
    localFindingId: decodeURIComponent(key.split(":")[3] ?? key),
    roleKind,
    roleId,
    category: "observation" as const,
    epistemicKind: roleKind === "lens" ? "heuristic" as const : "factual" as const,
    title: key,
    statement: key,
    canonicalIds: ["id"],
    citations: [{ canonicalId: "id" }],
    confidence: 3,
    ...(roleKind === "lens" ? { basis: ["model evidence"], limitations: ["test limitation"] } : {}),
  };
}
function specialistAssessment(roleId: "completeness", key: string) {
  return {
    roleKind: "specialist" as const,
    roleId,
    modelId: "model",
    publishedRevision: 1,
    definitionVersion: 1 as const,
    evaluatorVersion: "specialist/completeness@1",
    snapshotDigest: `sha256-${"a".repeat(64)}`,
    applicability: "applicable" as const,
    checkedEvidenceKeys: [],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: [],
    limitations: [],
    findings: [finding("specialist", roleId, key)],
    strengths: ["ok"],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}
function lensAssessment(roleId: "domain", key: string) {
  return {
    roleKind: "lens" as const,
    roleId,
    modelId: "model",
    publishedRevision: 1,
    definitionVersion: 1 as const,
    evaluatorVersion: "lens/domain@1",
    snapshotDigest: `sha256-${"a".repeat(64)}`,
    applicability: "applicable" as const,
    applicabilityRationale: "context",
    checkedEvidenceKeys: [],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: [],
    limitations: [],
    findings: [finding("lens", roleId, key)],
    strengths: ["ok"],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

Deno.test("V2 synthesis validates ordered coverage and canonical recommendation identity", () => {
  const a = qualifiedFindingKey("specialist", "completeness", "a");
  const b = qualifiedFindingKey("lens", "domain", "b");
  const assessments = [assessment("specialist", "completeness", a), assessment("lens", "domain", b)];
  const base = (source: string, title: string) => ({
    recommendationId: "r2-00000000",
    title,
    statement: title,
    qualifiedSourceFindingKeys: [source],
    citations: [],
    impact: 3,
    confidence: 3,
    scope: 3,
    effort: 3,
    score: 30,
    scoreExplanation: "x",
    epistemic: {
      mode: "factual" as const,
      factualSourceKeys: [],
      heuristicSourceKeys: [],
      basisSources: [],
      limitationSources: [],
      limitations: [],
    },
  });
  const first = base(a, "a");
  const second = base(b, "b");
  const fingerprints = [recommendationFingerprint(first), recommendationFingerprint(second)];
  const ids = canonicalRecommendationIds(fingerprints);
  const firstWithId = {
    ...first,
    recommendationId: canonicalRecommendationId(fingerprints[0]!, fingerprints),
  };
  const secondWithId = {
    ...second,
    recommendationId: canonicalRecommendationId(fingerprints[1]!, fingerprints),
    epistemic: {
      mode: "heuristic" as const,
      factualSourceKeys: [],
      heuristicSourceKeys: [b],
      basisSources: [{ qualifiedFindingKey: b, basis: "model evidence" }],
      limitationSources: [{ qualifiedFindingKey: b, limitation: "test limitation" }],
      limitations: ["test limitation"],
    },
  };
  // The canonical validator derives confidence, score, and epistemic metadata before ranking.
  const result = validateV2Synthesis(assessments, {
    recordVersion: 2,
    reviewId: "review",
    epoch: 1,
    modelId: "model",
    publishedRevision: 1,
    orderedQualifiedFindingKeys: [a, b],
    sourceReferenceCounts: [{ qualifiedFindingKey: b, count: 1 }, { qualifiedFindingKey: a, count: 1 }],
    strengths: ["ok"],
    recommendations: [firstWithId, secondWithId],
    synthesizedAt: "2026-01-01T00:00:00.000Z",
  });
  assertEquals(result.orderedQualifiedFindingKeys, [a, b]);
  assertEquals(result.recommendations.length, 2);
  assertEquals(
    [...ids.values()].sort(),
    ["r2-00000001", "r2-00000002"],
  );
  assertRejects(() =>
    validateV2Synthesis(assessments, {
      ...result,
      recommendations: [{ ...result.recommendations[0]!, recommendationId: "r2-ffffffff" }, result.recommendations[1]!],
    })
  );
  const reversed = validateV2Synthesis(assessments, {
    ...result,
    recommendations: [...result.recommendations].reverse(),
  });
  assertEquals(
    reversed.recommendations.map((recommendation) => recommendation.recommendationId),
    result.recommendations.map((recommendation) => recommendation.recommendationId),
  );
});

Deno.test("V2 recommendation fingerprint uses only ordered sources, title, and statement", () => {
  const a = qualifiedFindingKey("specialist", "completeness", "a");
  const b = qualifiedFindingKey("specialist", "completeness", "b");
  const base = {
    recommendationId: "r2-00000001",
    title: "Stable",
    statement: "Stable statement",
    qualifiedSourceFindingKeys: [a, b],
    citations: [{ canonicalId: "one" }],
    impact: 1,
    confidence: 1,
    scope: 1,
    effort: 1,
    score: 10,
    scoreExplanation: "caller value",
    epistemic: {
      mode: "factual" as const,
      factualSourceKeys: [],
      heuristicSourceKeys: [],
      basisSources: [],
      limitationSources: [],
      limitations: [],
    },
  };
  assertEquals(
    recommendationFingerprint(base),
    recommendationFingerprint({
      ...base,
      citations: [{ canonicalId: "two" }],
      impact: 5,
      confidence: 5,
      scope: 5,
      effort: 5,
      score: 50,
      scoreExplanation: "different",
    }),
  );
  assertEquals(
    recommendationFingerprint(base) === recommendationFingerprint({
      ...base,
      qualifiedSourceFindingKeys: [b, a],
    }),
    false,
  );
  assertRejects(
    () =>
      Promise.resolve(canonicalRecommendationIds([
        recommendationFingerprint(base),
        recommendationFingerprint({ ...base, citations: [] }),
      ])),
    undefined,
    "duplicate",
  );
});

Deno.test("V2 epistemic source pairs are deduplicated", () => {
  const key = qualifiedFindingKey("lens", "domain", "duplicate-metadata");
  const duplicated = lensAssessment("domain", key);
  duplicated.findings[0]!.basis = ["same basis", "same basis"];
  duplicated.findings[0]!.limitations = ["same limitation", "same limitation"];
  const recommendation = {
    recommendationId: "r2-00000001",
    title: "Deduplicate",
    statement: "Deduplicate metadata",
    qualifiedSourceFindingKeys: [key],
    citations: [{ canonicalId: "id" }],
    impact: 3,
    confidence: 3,
    scope: 3,
    effort: 3,
    score: 30,
    scoreExplanation: "caller",
    epistemic: {
      mode: "heuristic" as const,
      factualSourceKeys: [],
      heuristicSourceKeys: [key],
      basisSources: [],
      limitationSources: [],
      limitations: [],
    },
  };
  const result = validateV2Synthesis([duplicated], {
    recordVersion: 2,
    reviewId: "review",
    epoch: 1,
    modelId: "model",
    publishedRevision: 1,
    orderedQualifiedFindingKeys: [key],
    sourceReferenceCounts: [{ qualifiedFindingKey: key, count: 1 }],
    strengths: [],
    recommendations: [recommendation],
    synthesizedAt: "2026-01-01T00:00:00.000Z",
  });
  assertEquals(result.recommendations[0]!.epistemic.basisSources.length, 1);
  assertEquals(result.recommendations[0]!.epistemic.limitationSources.length, 1);
});
