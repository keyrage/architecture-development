import { assertEquals, assertRejects } from "./_test/assert.ts";
import {
  FindingV2Schema,
  lensDeclaration,
  qualifiedFindingKey,
  RecommendationV2Schema,
  ReviewStateV2Schema,
  RoleAssessmentV2Schema,
  RoleSnapshotSchema,
  validateV2Synthesis,
} from "./_lib/lenses.ts";
import { model } from "./architecture_review.ts";

const NOW = "2026-01-01T00:00:00.000Z";
type Resources = Record<string, Record<string, unknown>>;

const discovery = {
  apiVersion: "v1",
  capabilities: ["folders", "elements", "relationships"],
  limits: {
    maxPageSize: 200,
    maxTraversalDepth: 5,
    maxTraversalVisits: 10000,
    maxTraversalResults: 5000,
    maxHistoryResults: 1000,
    maxResponseBytes: 4194304,
  },
  model: { canonicalId: "model-1", name: "contract", purpose: "contract", properties: {} },
  graphContractVersion: 2,
  publishedRevision: 7,
};

function fetcher(url: string | URL | Request): Promise<Response> {
  const parsed = new URL(String(url));
  if (parsed.pathname.endsWith("/agent-query/v1")) {
    return Promise.resolve(
      new Response(JSON.stringify(discovery), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  const kind = parsed.pathname.split("/").at(-1);
  const items = kind === "elements"
    ? [{
      canonicalId: "element-1",
      type: "ApplicationComponent",
      folderId: null,
      name: "Contract element",
      documentation: "",
      properties: { architectureReviewLens: "domain" },
    }]
    : [];
  return Promise.resolve(
    new Response(
      JSON.stringify({
        apiVersion: "v1",
        modelId: "model-1",
        publishedRevision: 7,
        items,
        nextCursor: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}

function testContext(resources: Resources = {}) {
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  return {
    resources,
    writes,
    context: {
      globalArgs: {
        modelId: "model-1",
        endpointFile: "/tmp/task22-plan-v5-endpoint",
        bearerToken: "contract-secret-never-persisted",
      },
      fetcher: fetcher as typeof fetch,
      logger: { info: () => {}, warning: () => {} },
      writeResource: (spec: string, name: string, value: Record<string, unknown>) => {
        const stored = structuredClone(value);
        resources[name] = stored;
        writes.push({ spec, name, value: stored });
        return Promise.resolve({ name });
      },
      readResource: (name: string) => Promise.resolve(resources[name] ? structuredClone(resources[name]) : null),
    },
  };
}

function exactFinding(
  roleKind: "specialist" | "lens",
  roleId: string,
  localFindingId: string,
  epistemicKind: "factual" | "heuristic",
) {
  return {
    findingKey: qualifiedFindingKey(roleKind, roleId, localFindingId),
    localFindingId,
    roleKind,
    roleId,
    category: "observation" as const,
    epistemicKind,
    title: localFindingId,
    statement: `${localFindingId} statement`,
    canonicalIds: ["element-1"],
    citations: [{ canonicalId: "element-1" }],
    confidence: 3,
    ...(epistemicKind === "heuristic"
      ? { basis: ["heuristic basis"], limitations: ["heuristic limitation"] }
      : { basis: ["factual basis must not propagate"] }),
  };
}

Deno.test("plan v5 golden nested schemas accept exact shapes and reject recordVersion or extra keys", async () => {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "golden-shapes",
    selectedSpecialists: ["completeness"],
    selectedLenses: ["domain"],
  }, test.context);
  const snapshots = test.resources["roleSnapshotsV2-golden-shapes-e1-s0"]!.snapshots as Record<
    string,
    unknown
  >[];
  assertEquals(snapshots.every((snapshot) => !("recordVersion" in snapshot)), true);
  assertEquals(Object.keys(snapshots[0]!).sort(), [
    "definitionSnapshot",
    "definitionVersion",
    "evaluatorVersion",
    "roleId",
    "roleKind",
    "snapshotDigest",
  ]);
  assertEquals(Object.keys(snapshots[1]!.definitionSnapshot as Record<string, unknown>).sort(), [
    "concernPredicate",
    "contextTrigger",
    "kind",
    "limitations",
    "requiredContextEvidenceKeys",
    "requiredEvaluatedEvidenceKeys",
  ]);
  assertEquals(RoleSnapshotSchema.safeParse(snapshots[0]).success, true);
  assertEquals(RoleSnapshotSchema.safeParse({ ...snapshots[0], recordVersion: 2 }).success, false);
  assertEquals(
    RoleSnapshotSchema.safeParse({
      ...snapshots[1],
      definitionSnapshot: {
        ...(snapshots[1]!.definitionSnapshot as Record<string, unknown>),
        epistemicKind: "heuristic",
      },
    }).success,
    false,
  );

  const finding = exactFinding("specialist", "completeness", "golden", "factual");
  assertEquals(FindingV2Schema.safeParse(finding).success, true);
  assertEquals(FindingV2Schema.safeParse({ ...finding, recordVersion: 2 }).success, false);
  const assessment = {
    roleKind: "specialist" as const,
    roleId: "completeness" as const,
    modelId: "model-1",
    publishedRevision: 7,
    definitionVersion: 1 as const,
    evaluatorVersion: snapshots[0]!.evaluatorVersion,
    snapshotDigest: snapshots[0]!.snapshotDigest,
    applicability: "applicable" as const,
    checkedEvidenceKeys: [],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: [],
    limitations: [],
    findings: [finding],
    strengths: [],
    completedAt: NOW,
  };
  assertEquals(RoleAssessmentV2Schema.safeParse(assessment).success, true);
  assertEquals(RoleAssessmentV2Schema.safeParse({ ...assessment, recordVersion: 2 }).success, false);
  const recommendation = {
    recommendationId: "r2-00000001",
    title: "golden",
    statement: "golden statement",
    qualifiedSourceFindingKeys: [finding.findingKey],
    citations: [{ canonicalId: "element-1" }],
    impact: 3,
    confidence: 3,
    scope: 3,
    effort: 3,
    score: 30,
    scoreExplanation: "derived",
    epistemic: {
      mode: "factual" as const,
      factualSourceKeys: [finding.findingKey],
      heuristicSourceKeys: [],
      basisSources: [],
      limitationSources: [],
      limitations: [],
    },
  };
  assertEquals(RecommendationV2Schema.safeParse(recommendation).success, true);
  assertEquals(RecommendationV2Schema.safeParse({ ...recommendation, recordVersion: 2 }).success, false);

  const state = test.resources["reviewStateV2-golden-shapes-e1-s0"]!;
  assertEquals("stoppedFromPhase" in state, false);
  assertEquals(
    ReviewStateV2Schema.safeParse({
      ...state,
      expectedGroups: ["Application", "Application"],
    }).success,
    false,
  );
  assertEquals(
    ReviewStateV2Schema.safeParse({
      ...state,
      roleSnapshotResourceName: "wrong",
    }).success,
    false,
  );
});

async function collectedContractFixture(reviewId: string) {
  const test = testContext();
  await Deno.writeTextFile("/tmp/task22-plan-v5-endpoint", "http://127.0.0.1:9999");
  const started = await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId,
    selectedSpecialists: [],
    selectedLenses: ["domain"],
  }, test.context);
  const collected = await model.methods.collect_evidence!.execute({
    schemaVersion: 2,
    reviewId,
    epoch: 1,
  }, test.context);
  const snapshots = test.resources[`roleSnapshotsV2-${reviewId}-e1-s0`]!.snapshots as Record<
    string,
    unknown
  >[];
  const declaration = lensDeclaration("domain");
  const finding = exactFinding("lens", "domain", "matched", "heuristic");
  const assessment = {
    roleKind: "lens" as const,
    roleId: "domain" as const,
    modelId: "model-1",
    publishedRevision: 7,
    definitionVersion: 1 as const,
    evaluatorVersion: snapshots[0]!.evaluatorVersion,
    snapshotDigest: snapshots[0]!.snapshotDigest,
    applicability: "applicable" as const,
    applicabilityRationale: "declared concern predicate matched",
    checkedEvidenceKeys: ["elements"],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: ["domainSignals"],
    limitations: [...declaration.limitations],
    findings: [finding],
    strengths: [],
    completedAt: NOW,
  };
  return { test, assessment, finding, started, collected };
}

Deno.test("plan v5 public V2 happy path uses exact outputs and resource formulas", async () => {
  const { test, assessment, finding, started, collected } = await collectedContractFixture(
    "public-contract",
  );
  assertEquals(Object.keys(started).sort(), [
    "dataHandles",
    "epoch",
    "reviewId",
    "roleSnapshotResourceName",
    "schemaVersion",
    "selectedLenses",
    "selectedSpecialists",
  ]);
  assertEquals(started.roleSnapshotResourceName, "roleSnapshotsV2-public-contract-e1-s0");
  assertEquals(Object.keys(collected).sort(), [
    "counts",
    "dataHandles",
    "epoch",
    "restarted",
    "reviewId",
    "revision",
    "roleSnapshotResourceName",
    "schemaVersion",
    "selectedLenses",
    "selectedSpecialists",
  ]);
  const status = await model.methods.status!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
  }, test.context);
  assertEquals(Object.keys(status).sort(), [
    "roleSnapshotResourceName",
    "schemaVersion",
    "selectedLenses",
    "selectedSpecialists",
    "snapshots",
    "state",
  ]);
  assertEquals(status.schemaVersion, 2);
  assertEquals((status.state as Record<string, unknown>).phase, "assessing");
  const assessed = await model.methods.record_assessments!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
    assessments: [assessment],
  }, test.context);
  assertEquals(assessed.roles, [{ roleKind: "lens", roleId: "domain" }]);
  const limitation = lensDeclaration("domain").limitations[0]!;
  const synthesis = await model.methods.record_synthesis!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
    synthesis: {
      recordVersion: 2,
      reviewId: "public-contract",
      epoch: 1,
      modelId: "model-1",
      publishedRevision: 7,
      orderedQualifiedFindingKeys: [finding.findingKey],
      sourceReferenceCounts: [{ qualifiedFindingKey: finding.findingKey, count: 1 }],
      strengths: [],
      recommendations: [{
        recommendationId: "r2-00000001",
        title: "Resolve domain concern",
        statement: "Resolve the persisted domain concern.",
        qualifiedSourceFindingKeys: [finding.findingKey],
        citations: [{ canonicalId: "element-1" }],
        impact: 3,
        confidence: 3,
        scope: 3,
        effort: 3,
        score: 30,
        scoreExplanation: "caller value is recomputed",
        epistemic: {
          mode: "heuristic",
          factualSourceKeys: [],
          heuristicSourceKeys: [finding.findingKey],
          basisSources: [{ qualifiedFindingKey: finding.findingKey, basis: "heuristic basis" }],
          limitationSources: [{ qualifiedFindingKey: finding.findingKey, limitation }],
          limitations: [limitation],
        },
      }],
      synthesizedAt: NOW,
    },
  }, test.context);
  assertEquals(synthesis.recommendationCount, 1);
  const followup = await model.methods.record_followup!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
    sequence: 1,
    recommendationId: "r2-00000001",
    roleKind: "lens",
    roleId: "domain",
    question: "Why?",
    response: "Persisted evidence.",
  }, test.context);
  assertEquals(followup.dataHandles, [{ name: "followupV2-public-contract-e1-s1" }]);
  const disposition = await model.methods.disposition!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
    recommendationId: "r2-00000001",
    roleKind: "lens",
    roleId: "domain",
    disposition: "accepted",
    rationale: "Accepted after review.",
  }, test.context);
  assertEquals(disposition.dataHandles, [{ name: "dispositionV2-public-contract-e1-sr2-00000001" }]);
  const stopped = await model.methods.stop!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
  }, test.context);
  assertEquals(stopped.stopped, true);
  assertEquals(stopped.selectedLenses, ["domain"]);
  const resumed = await model.methods.resume!.execute({
    schemaVersion: 2,
    reviewId: "public-contract",
    epoch: 1,
  }, test.context);
  assertEquals(resumed.freshAssessmentRequired, false);
  assertEquals(resumed.roleSnapshotResourceName, "roleSnapshotsV2-public-contract-e1-s0");
  assertEquals(test.resources["reviewStateV2-public-contract-e1-s0"]!.phase, "dialogue");
  assertEquals(
    test.writes.some((write) => JSON.stringify(write.value).includes("contract-secret-never-persisted")),
    false,
  );
});

Deno.test("plan v5 evidence reader rejects identity, ordering, count, digest, marker and extra-chunk tampering", async () => {
  const { test, assessment } = await collectedContractFixture("integrity-base");
  const baseline = structuredClone(test.resources);
  const chunkNames = Object.keys(baseline).filter((name) => name.startsWith("evidenceChunkV2-")).sort();
  const manifestName = "evidenceManifestV2-integrity-base-e1-s0";
  const cases: Array<(resources: Resources) => void> = [
    (resources) => {
      resources[chunkNames[0]!]!.digest = "0".repeat(64);
    },
    (resources) => {
      const element = resources[chunkNames[1]!]!.items as Record<string, unknown>[];
      (element[0]!.properties as Record<string, unknown>).architectureReviewLens = [];
    },
    (resources) => {
      resources[chunkNames[1]!]!.itemCount = 99;
    },
    (resources) => {
      resources[chunkNames[1]!]!.reviewId = "wrong";
    },
    (resources) => {
      resources[chunkNames[1]!]!.epoch = 2;
    },
    (resources) => {
      resources[chunkNames[1]!]!.sequence = 0;
    },
    (resources) => {
      resources[chunkNames[0]!]!.kind = "relationships";
    },
    (resources) => {
      (resources[manifestName]!.counts as Record<string, unknown>).elements = 99;
    },
    (resources) => {
      delete resources[chunkNames[1]!];
    },
    (resources) => {
      const extra = structuredClone(resources[chunkNames[2]!]!);
      extra.sequence = 3;
      resources["evidenceChunkV2-integrity-base-e1-s3"] = extra;
    },
  ];
  for (const mutate of cases) {
    const resources = structuredClone(baseline);
    mutate(resources);
    const attempt = testContext(resources);
    await assertRejects(() =>
      model.methods.record_assessments!.execute({
        schemaVersion: 2,
        reviewId: "integrity-base",
        epoch: 1,
        assessments: [assessment],
      }, attempt.context)
    );
    assertEquals(attempt.writes.some((write) => write.spec === "specialistAssessmentsV2"), false);
  }
});

Deno.test("plan v5 mixed epistemic provenance excludes factual basis", () => {
  const factual = exactFinding("specialist", "completeness", "factual", "factual");
  const heuristic = exactFinding("lens", "domain", "heuristic", "heuristic");
  const specialist = {
    roleKind: "specialist" as const,
    roleId: "completeness" as const,
    modelId: "model-1",
    publishedRevision: 7,
    definitionVersion: 1 as const,
    evaluatorVersion: "specialist/completeness@1",
    snapshotDigest: `sha256-${"a".repeat(64)}`,
    applicability: "applicable" as const,
    checkedEvidenceKeys: [],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: [],
    limitations: [],
    findings: [factual],
    strengths: [],
    completedAt: NOW,
  };
  const lens = {
    roleKind: "lens" as const,
    roleId: "domain" as const,
    modelId: "model-1",
    publishedRevision: 7,
    definitionVersion: 1 as const,
    evaluatorVersion: "lens/domain@1",
    snapshotDigest: `sha256-${"b".repeat(64)}`,
    applicability: "applicable" as const,
    applicabilityRationale: "matched",
    checkedEvidenceKeys: ["elements"],
    missingEvidenceKeys: [],
    evaluatedEvidenceKeys: ["domainSignals"],
    limitations: [],
    findings: [heuristic],
    strengths: [],
    completedAt: NOW,
  };
  const result = validateV2Synthesis([specialist, lens], {
    recordVersion: 2,
    reviewId: "mixed",
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 7,
    orderedQualifiedFindingKeys: [factual.findingKey, heuristic.findingKey],
    sourceReferenceCounts: [factual.findingKey, heuristic.findingKey]
      .sort((a, b) => a.localeCompare(b))
      .map((qualifiedFindingKey) => ({ qualifiedFindingKey, count: 1 })),
    strengths: [],
    recommendations: [{
      recommendationId: "r2-00000001",
      title: "Mixed",
      statement: "Mixed sources",
      qualifiedSourceFindingKeys: [factual.findingKey, heuristic.findingKey],
      citations: [{ canonicalId: "element-1" }],
      impact: 3,
      confidence: 3,
      scope: 3,
      effort: 3,
      score: 30,
      scoreExplanation: "caller",
      epistemic: {
        mode: "mixed",
        factualSourceKeys: [factual.findingKey],
        heuristicSourceKeys: [heuristic.findingKey],
        basisSources: [{ qualifiedFindingKey: heuristic.findingKey, basis: "heuristic basis" }],
        limitationSources: [{
          qualifiedFindingKey: heuristic.findingKey,
          limitation: "heuristic limitation",
        }],
        limitations: ["heuristic limitation"],
      },
    }],
    synthesizedAt: NOW,
  });
  assertEquals(result.recommendations[0]!.epistemic.basisSources, [{
    qualifiedFindingKey: heuristic.findingKey,
    basis: "heuristic basis",
  }]);
});
