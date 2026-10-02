import { assertEquals, assertRejects } from "./_test/assert.ts";
import {
  classifyLens,
  deriveLensEvidence,
  LENS_ORDER,
  lensDeclaration,
  qualifiedFindingKey,
  type ReviewStateV2,
  validateLensDeclaration,
} from "./_lib/lenses.ts";
import { model } from "./architecture_review.ts";

const NOW = "2026-01-01T00:00:00.000Z";
async function digest(items: unknown[]): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(items)),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function testContext() {
  const resources: Record<string, Record<string, unknown>> = {};
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  return {
    resources,
    writes,
    context: {
      globalArgs: { modelId: "model-1", endpointFile: "/tmp/unused", bearerToken: "secret" },
      logger: { info: () => {}, warning: () => {} },
      writeResource: (spec: string, name: string, value: Record<string, unknown>) => {
        resources[name] = structuredClone(value);
        writes.push({ spec, name, value: structuredClone(value) });
        return Promise.resolve({ name });
      },
      readResource: (name: string) => Promise.resolve(resources[name] ? structuredClone(resources[name]) : null),
    },
  };
}

async function assessmentFixture(
  reviewId: string,
  elements: Record<string, unknown>[],
) {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId,
    selectedSpecialists: [],
    selectedLenses: [...LENS_ORDER],
  }, test.context);
  const stateName = `reviewStateV2-${reviewId}-e1-s0`;
  test.resources[stateName] = {
    ...test.resources[stateName]!,
    phase: "assessing",
    publishedRevision: 1,
  };
  test.resources[`evidenceManifestV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    complete: true,
    chunkCount: 3,
    counts: { folders: 0, elements: elements.length, relationships: 0 },
    collectedAt: NOW,
    restarted: false,
  };
  for (
    const [sequence, kind, items] of [
      [0, "folders", []],
      [1, "elements", elements],
      [2, "relationships", []],
    ] as const
  ) {
    test.resources[`evidenceChunkV2-${reviewId}-e1-s${sequence}`] = {
      recordVersion: 2,
      reviewId,
      epoch: 1,
      sequence,
      modelId: "model-1",
      publishedRevision: 1,
      kind,
      items,
      itemCount: items.length,
      digest: await digest([...items]),
    };
  }
  const evidence = deriveLensEvidence({ folders: [], elements, relationships: [] });
  const snapshotRecord = test.resources[`roleSnapshotsV2-${reviewId}-e1-s0`]!;
  const snapshots = snapshotRecord.snapshots as Record<string, unknown>[];
  const assessments = LENS_ORDER.map((roleId) => {
    const declaration = lensDeclaration(roleId);
    const applicability = classifyLens(roleId, evidence);
    const snapshot = snapshots.find((entry) => entry.roleId === roleId)!;
    const findings = applicability.concernMatched
      ? [{
        findingKey: qualifiedFindingKey("lens", roleId, "persisted-concern"),
        localFindingId: "persisted-concern",
        roleKind: "lens",
        roleId,
        category: "observation",
        epistemicKind: "heuristic",
        title: `${roleId} concern`,
        statement: `${roleId} concern is present in persisted evidence`,
        canonicalIds: ["element-1"],
        citations: [{ canonicalId: "element-1" }],
        confidence: 3,
        basis: ["persisted Archi marker"],
        limitations: [...declaration.limitations],
      }]
      : [];
    return {
      roleKind: "lens",
      roleId,
      modelId: "model-1",
      publishedRevision: 1,
      definitionVersion: 1,
      evaluatorVersion: snapshot.evaluatorVersion,
      snapshotDigest: snapshot.snapshotDigest,
      applicability: applicability.applicability,
      applicabilityRationale: applicability.rationale,
      checkedEvidenceKeys: applicability.checkedEvidenceKeys,
      missingEvidenceKeys: applicability.missingEvidenceKeys,
      evaluatedEvidenceKeys: applicability.evaluatedEvidenceKeys,
      limitations: [...declaration.limitations],
      findings,
      strengths: [],
      completedAt: NOW,
    };
  });
  return { test, assessments };
}

Deno.test("cycle 6: all lenses enforce persisted no-concern and matched-concern findings", async () => {
  const empty = await assessmentFixture("empty-context", []);
  await model.methods.record_assessments!.execute({
    schemaVersion: 2,
    reviewId: "empty-context",
    epoch: 1,
    assessments: empty.assessments,
  }, empty.test.context);
  assertEquals(
    empty.assessments.every((entry) => entry.applicability === "not-applicable" && entry.findings.length === 0),
    true,
  );

  const absent = await assessmentFixture("absent-concern", [{ canonicalId: "element-1", properties: {} }]);
  await model.methods.record_assessments!.execute({
    schemaVersion: 2,
    reviewId: "absent-concern",
    epoch: 1,
    assessments: absent.assessments,
  }, absent.test.context);
  assertEquals(
    absent.assessments.every((entry) => entry.applicability === "applicable" && entry.findings.length === 0),
    true,
  );
  const injected = structuredClone(absent.assessments);
  injected[0]!.findings = [{
    findingKey: qualifiedFindingKey("lens", LENS_ORDER[0], "invented"),
    localFindingId: "invented",
    roleKind: "lens",
    roleId: LENS_ORDER[0],
    category: "observation",
    epistemicKind: "heuristic",
    title: "invented",
    statement: "invented",
    canonicalIds: ["element-1"],
    citations: [{ canonicalId: "element-1" }],
    confidence: 3,
    basis: ["invented"],
    limitations: ["invented"],
  }];
  // Restore assessing to prove the durable boundary itself rejects an invented finding.
  absent.test.resources["reviewStateV2-absent-concern-e1-s0"]!.phase = "assessing";
  await assertRejects(() =>
    model.methods.record_assessments!.execute({
      schemaVersion: 2,
      reviewId: "absent-concern",
      epoch: 1,
      assessments: injected,
    }, absent.test.context)
  );

  const matched = await assessmentFixture("matched-concern", [{
    canonicalId: "element-1",
    properties: { architectureReviewLens: [...LENS_ORDER] },
  }]);
  await model.methods.record_assessments!.execute({
    schemaVersion: 2,
    reviewId: "matched-concern",
    epoch: 1,
    assessments: matched.assessments,
  }, matched.test.context);
  assertEquals(
    matched.assessments.every((entry) => entry.applicability === "applicable" && entry.findings.length === 1),
    true,
  );
  const omitted = structuredClone(matched.assessments);
  omitted[0]!.findings = [];
  matched.test.resources["reviewStateV2-matched-concern-e1-s0"]!.phase = "assessing";
  await assertRejects(() =>
    model.methods.record_assessments!.execute({
      schemaVersion: 2,
      reviewId: "matched-concern",
      epoch: 1,
      assessments: omitted,
    }, matched.test.context)
  );
});

Deno.test("cycle 6: malformed persisted concern markers record insufficient evidence with no findings", async () => {
  const fixture = await assessmentFixture("malformed-markers", [{
    properties: { architectureReviewLens: [...LENS_ORDER] },
  }]);
  assertEquals(
    fixture.assessments.every((entry) =>
      entry.applicability === "insufficient-evidence" && entry.findings.length === 0
    ),
    true,
  );
  await model.methods.record_assessments!.execute({
    schemaVersion: 2,
    reviewId: "malformed-markers",
    epoch: 1,
    assessments: fixture.assessments,
  }, fixture.test.context);
  assertEquals(
    fixture.test.writes.some((write) => write.spec === "specialistAssessmentsV2"),
    true,
  );
});

Deno.test("cycle 6: malformed durable lens evidence fails closed before assessment persistence", async () => {
  const fixture = await assessmentFixture("malformed-evidence", [{ canonicalId: "element-1" }]);
  fixture.test.resources["evidenceChunkV2-malformed-evidence-e1-s1"]!.items = null;
  await assertRejects(() =>
    model.methods.record_assessments!.execute({
      schemaVersion: 2,
      reviewId: "malformed-evidence",
      epoch: 1,
      assessments: fixture.assessments,
    }, fixture.test.context)
  );
  assertEquals(fixture.test.writes.some((write) => write.spec === "specialistAssessmentsV2"), false);
});

Deno.test("cycle 6: declaration overlap and persisted selection tampering fail closed", async () => {
  const declaration = lensDeclaration("domain");
  await assertRejects(
    () =>
      Promise.resolve(validateLensDeclaration({
        ...declaration,
        requiredEvaluatedEvidenceKeys: ["elements"],
        concernEvidenceKeys: ["elements"],
        concernPredicate: { kind: "countAtLeast", key: "elements", minimum: 1 },
      })),
    undefined,
    "disjoint",
  );

  for (
    const [reviewId, mutate] of [
      ["reordered-selection", (state: ReviewStateV2) => ({ ...state, selectedLenses: ["security", "domain"] })],
      ["duplicate-selection", (state: ReviewStateV2) => ({ ...state, selectedLenses: ["domain", "domain"] })],
    ] as const
  ) {
    const test = testContext();
    await model.methods.start_review!.execute({
      schemaVersion: 2,
      reviewId,
      selectedSpecialists: [],
      selectedLenses: ["domain", "security"],
    }, test.context);
    const name = `reviewStateV2-${reviewId}-e1-s0`;
    test.resources[name] = mutate(test.resources[name] as ReviewStateV2);
    await assertRejects(() => model.methods.status!.execute({ schemaVersion: 2, reviewId, epoch: 1 }, test.context));
  }

  for (
    const [reviewId, mutate] of [
      ["reordered-snapshot", (snapshots: unknown[]) => snapshots.reverse()],
      [
        "duplicate-snapshot",
        (snapshots: unknown[]) => snapshots.splice(1, 1, structuredClone(snapshots[0])),
      ],
    ] as const
  ) {
    const snapshotTest = testContext();
    await model.methods.start_review!.execute({
      schemaVersion: 2,
      reviewId,
      selectedSpecialists: [],
      selectedLenses: ["domain", "security"],
    }, snapshotTest.context);
    const snapshots = snapshotTest.resources[`roleSnapshotsV2-${reviewId}-e1-s0`]!.snapshots as unknown[];
    mutate(snapshots);
    await assertRejects(() =>
      model.methods.status!.execute({
        schemaVersion: 2,
        reviewId,
        epoch: 1,
      }, snapshotTest.context)
    );
  }
});

Deno.test("cycle 6: synthesis rejects nested route identity mismatches", async () => {
  for (const mismatch of [{ reviewId: "other", epoch: 1 }, { reviewId: "synthesis-identity", epoch: 2 }]) {
    const test = testContext();
    await model.methods.start_review!.execute({
      schemaVersion: 2,
      reviewId: "synthesis-identity",
      selectedSpecialists: ["completeness"],
    }, test.context);
    test.resources["reviewStateV2-synthesis-identity-e1-s0"] = {
      ...test.resources["reviewStateV2-synthesis-identity-e1-s0"]!,
      phase: "synthesizing",
      publishedRevision: 1,
    };
    test.resources["specialistAssessmentsV2-synthesis-identity-e1-s0"] = {
      recordVersion: 2,
      reviewId: "synthesis-identity",
      epoch: 1,
      modelId: "model-1",
      publishedRevision: 1,
      assessments: [],
      recordedAt: NOW,
    };
    await assertRejects(() =>
      model.methods.record_synthesis!.execute({
        schemaVersion: 2,
        reviewId: "synthesis-identity",
        epoch: 1,
        synthesis: {
          recordVersion: 2,
          ...mismatch,
          modelId: "model-1",
          publishedRevision: 1,
          orderedQualifiedFindingKeys: [],
          sourceReferenceCounts: [],
          strengths: [],
          recommendations: [],
          synthesizedAt: NOW,
        },
      }, test.context)
    );
  }
});

Deno.test("cycle 6: every routed V2 envelope is strict and collection remains atomic", () => {
  const valid: Record<string, Record<string, unknown>> = {
    start_review: { schemaVersion: 2, reviewId: "strict" },
    status: { schemaVersion: 2, reviewId: "strict", epoch: 1 },
    collect_evidence: { schemaVersion: 2, reviewId: "strict", epoch: 1 },
    record_assessments: { schemaVersion: 2, reviewId: "strict", epoch: 1, assessments: [] },
    record_synthesis: {
      schemaVersion: 2,
      reviewId: "strict",
      epoch: 1,
      synthesis: {
        recordVersion: 2,
        reviewId: "strict",
        epoch: 1,
        modelId: "model-1",
        publishedRevision: 1,
        orderedQualifiedFindingKeys: [],
        sourceReferenceCounts: [],
        strengths: [],
        recommendations: [],
        synthesizedAt: NOW,
      },
    },
    record_followup: {
      schemaVersion: 2,
      reviewId: "strict",
      epoch: 1,
      sequence: 1,
      recommendationId: "r2-00000001",
      roleKind: "lens",
      roleId: "domain",
      question: "q",
      response: "a",
    },
    disposition: {
      schemaVersion: 2,
      reviewId: "strict",
      epoch: 1,
      recommendationId: "r2-00000001",
      roleKind: "lens",
      roleId: "domain",
      disposition: "undecided",
      rationale: "later",
    },
    stop: { schemaVersion: 2, reviewId: "strict", epoch: 1 },
    resume: { schemaVersion: 2, reviewId: "strict", epoch: 1 },
  };
  for (const [name, envelope] of Object.entries(valid)) {
    assertEquals(model.methods[name]!.arguments!.safeParse(envelope).success, true);
    assertEquals(model.methods[name]!.arguments!.safeParse({ ...envelope, unknownCycle6Key: true }).success, false);
  }
  assertEquals(
    (model.methods.collect_evidence as unknown as { rollbackOnFailure?: boolean }).rollbackOnFailure,
    true,
  );
});

async function installPhaseRecords(
  test: ReturnType<typeof testContext>,
  reviewId: string,
  phase: "assessing" | "synthesizing" | "dialogue",
) {
  const items: Record<string, unknown>[] = [];
  test.resources[`evidenceManifestV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    complete: true,
    chunkCount: 3,
    counts: { folders: 0, elements: 0, relationships: 0 },
    collectedAt: NOW,
    restarted: false,
  };
  for (
    const [sequence, kind] of [
      [0, "folders"],
      [1, "elements"],
      [2, "relationships"],
    ] as const
  ) {
    test.resources[`evidenceChunkV2-${reviewId}-e1-s${sequence}`] = {
      recordVersion: 2,
      reviewId,
      epoch: 1,
      sequence,
      modelId: "model-1",
      publishedRevision: 1,
      kind,
      items,
      itemCount: 0,
      digest: await digest(items),
    };
  }
  if (phase === "assessing") return;
  const snapshotRecord = test.resources[`roleSnapshotsV2-${reviewId}-e1-s0`]!;
  const snapshot = (snapshotRecord.snapshots as Record<string, unknown>[])[0]!;
  test.resources[`specialistAssessmentsV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    assessments: [{
      roleKind: "specialist",
      roleId: "completeness",
      modelId: "model-1",
      publishedRevision: 1,
      definitionVersion: 1,
      evaluatorVersion: snapshot.evaluatorVersion,
      snapshotDigest: snapshot.snapshotDigest,
      applicability: "applicable",
      checkedEvidenceKeys: ["elements"],
      missingEvidenceKeys: [],
      evaluatedEvidenceKeys: ["elements"],
      limitations: (snapshot.definitionSnapshot as { limitations: string[] }).limitations,
      findings: [],
      strengths: [],
      completedAt: NOW,
    }],
    recordedAt: NOW,
  };
  if (phase === "synthesizing") return;
  test.resources[`synthesisV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    orderedQualifiedFindingKeys: [],
    sourceReferenceCounts: [],
    strengths: [],
    recommendations: [],
    synthesizedAt: NOW,
  };
}

function discovery(revision: number) {
  return {
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
    model: { canonicalId: "model-1", name: "test", purpose: "test", properties: {} },
    graphContractVersion: 2,
    publishedRevision: revision,
  };
}

Deno.test("cycle 6: stopped collecting resumes the same epoch without a baseline revision", async () => {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "resume-collecting",
    selectedSpecialists: ["completeness"],
  }, test.context);
  await model.methods.stop!.execute({ schemaVersion: 2, reviewId: "resume-collecting", epoch: 1 }, test.context);
  const result = await model.methods.resume!.execute({
    schemaVersion: 2,
    reviewId: "resume-collecting",
    epoch: 1,
  }, test.context) as Record<string, unknown>;
  assertEquals(result.freshAssessmentRequired, false);
  assertEquals(result.epoch, 1);
  assertEquals(test.resources["reviewStateV2-resume-collecting-e1-s0"]!.phase, "collecting");
  assertEquals(test.resources["reviewStateV2-resume-collecting-e2-s0"], undefined);
});

Deno.test("cycle 6: resume restores assessing, synthesizing, and dialogue exactly", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "cycle6-resume-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  try {
    for (const phase of ["assessing", "synthesizing", "dialogue"] as const) {
      const test = testContext();
      test.context.globalArgs.endpointFile = endpointFile;
      (test.context as typeof test.context & { fetcher: typeof fetch }).fetcher = (() =>
        Promise.resolve(
          new Response(JSON.stringify(discovery(1)), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )) as typeof fetch;
      const reviewId = `resume-${phase}`;
      await model.methods.start_review!.execute({
        schemaVersion: 2,
        reviewId,
        selectedSpecialists: ["completeness"],
      }, test.context);
      test.resources[`reviewStateV2-${reviewId}-e1-s0`] = {
        ...test.resources[`reviewStateV2-${reviewId}-e1-s0`]!,
        phase,
        publishedRevision: 1,
      };
      await installPhaseRecords(test, reviewId, phase);
      await model.methods.stop!.execute({ schemaVersion: 2, reviewId, epoch: 1 }, test.context);
      await model.methods.resume!.execute({ schemaVersion: 2, reviewId, epoch: 1 }, test.context);
      assertEquals(test.resources[`reviewStateV2-${reviewId}-e1-s0`]!.phase, phase);
    }
  } finally {
    await Deno.remove(endpointFile);
  }
});

Deno.test("cycle 6: changed-revision resume rejects an occupied next epoch", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "cycle6-occupied-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  try {
    const test = testContext();
    test.context.globalArgs.endpointFile = endpointFile;
    (test.context as typeof test.context & { fetcher: typeof fetch }).fetcher = (() =>
      Promise.resolve(
        new Response(JSON.stringify(discovery(2)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )) as typeof fetch;
    await model.methods.start_review!.execute({
      schemaVersion: 2,
      reviewId: "occupied-next",
      selectedSpecialists: ["completeness"],
    }, test.context);
    test.resources["reviewStateV2-occupied-next-e1-s0"] = {
      ...test.resources["reviewStateV2-occupied-next-e1-s0"]!,
      phase: "dialogue",
      publishedRevision: 1,
    };
    await installPhaseRecords(test, "occupied-next", "dialogue");
    await model.methods.stop!.execute({ schemaVersion: 2, reviewId: "occupied-next", epoch: 1 }, test.context);
    test.resources["reviewStateV2-occupied-next-e2-s0"] = { occupied: true };
    await assertRejects(() =>
      model.methods.resume!.execute({
        schemaVersion: 2,
        reviewId: "occupied-next",
        epoch: 1,
      }, test.context)
    );
  } finally {
    await Deno.remove(endpointFile);
  }
});
