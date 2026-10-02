import { assertEquals, assertRejects } from "./_test/assert.ts";
import { persistedReview } from "./_test/persisted_review.ts";
import { model } from "./architecture_review.ts";
import { qualifiedFindingKey } from "./_lib/lenses.ts";

type Fixture = Awaited<ReturnType<typeof persistedReview>>;
type Mutation = (test: Fixture) => void;
const identity = { schemaVersion: 2, reviewId: "semantic", epoch: 1 };
const dialogue = {
  ...identity,
  recommendationId: "r2-00000001",
  roleKind: "specialist",
  roleId: "completeness",
};
function input(method: string, test: Fixture) {
  if (method === "record_synthesis") return { ...identity, synthesis: test.synthesis };
  if (method === "record_followup") return { ...dialogue, sequence: 1, question: "Why?", response: "Evidence." };
  if (method === "disposition") return { ...dialogue, disposition: "deferred", rationale: "Investigate." };
  return identity;
}
function setAssessments(test: Fixture, value: unknown) {
  test.resources[test.name("specialistAssessments")]!.assessments = value;
}
const inventoryMutations: Record<string, Mutation> = {
  empty: (t) => setAssessments(t, []),
  subset: (t) => setAssessments(t, [t.assessments[0]]),
  superset: (t) => setAssessments(t, [...t.assessments, { ...t.assessments[0], roleId: "documentationClarity" }]),
  duplicate: (t) => setAssessments(t, [t.assessments[0], t.assessments[0]]),
  reordered: (t) => setAssessments(t, [...t.assessments].reverse()),
};
const semanticMutations: Record<string, Mutation> = {
  model: (t) => {
    t.assessments[0]!.modelId = "other";
  },
  revision: (t) => {
    t.assessments[0]!.publishedRevision = 8;
  },
  evaluator: (t) => {
    t.assessments[0]!.evaluatorVersion = "specialist/completeness@2";
  },
  digest: (t) => {
    t.assessments[0]!.snapshotDigest = `sha256-${"0".repeat(64)}`;
  },
  checkedOmitted: (t) => {
    t.assessments[0]!.checkedEvidenceKeys = [];
  },
  checkedForged: (t) => {
    t.assessments[0]!.checkedEvidenceKeys = ["invented"];
  },
  checkedDuplicate: (t) => {
    t.assessments[0]!.checkedEvidenceKeys = ["elements", "elements"];
  },
  evaluatedReordered: (t) => {
    t.assessments[0]!.evaluatedEvidenceKeys = ["relationships", "elements"];
  },
  missing: (t) => {
    (t.assessments[0] as unknown as Record<string, unknown>).missingEvidenceKeys = ["elements"];
  },
  limitations: (t) => {
    t.assessments[0]!.limitations = ["forged"];
  },
  applicability: (t) => {
    t.assessments[1]!.applicability = "not-applicable";
  },
  lensChecked: (t) => {
    t.assessments[1]!.checkedEvidenceKeys = [];
  },
  lensMissing: (t) => {
    (t.assessments[1] as unknown as Record<string, unknown>).missingEvidenceKeys = ["domainSignals"];
  },
  lensEvaluated: (t) => {
    t.assessments[1]!.evaluatedEvidenceKeys = [];
  },
  lensLimitations: (t) => {
    t.assessments[1]!.limitations = [];
  },
  rationale: (t) => {
    (t.assessments[1] as unknown as Record<string, unknown>).applicabilityRationale = "forged";
  },
  wrongParent: (t) => {
    const finding = t.assessments[0]!.findings[0]!;
    finding.roleKind = "lens";
    finding.roleId = "domain";
    finding.findingKey = qualifiedFindingKey("lens", "domain", finding.localFindingId);
  },
  duplicateFinding: (t) => {
    t.assessments[0]!.findings.push(structuredClone(t.assessments[0]!.findings[0]!));
  },
  absentConcernFinding: (t) => {
    t.assessments[1]!.findings = structuredClone(t.assessments[0]!.findings);
  },
};

Deno.test("cycle 11: V2 synthesis, dialogue and resume reject every incomplete or noncanonical persisted role inventory with zero writes", async () => {
  for (const method of ["record_synthesis", "record_followup", "disposition", "resume", "stop"]) {
    for (const mutate of Object.values(inventoryMutations)) {
      const test = await persistedReview(
        "semantic",
        method === "resume" ? "stopped" : method === "record_synthesis" ? "synthesizing" : "dialogue",
      );
      mutate(test);
      await assertRejects(() => model.methods[method]!.execute(input(method, test), test.context));
      assertEquals(test.writes, []);
    }
  }
});

Deno.test("cycle 11: every persisted V2 assessment semantic echo is revalidated at synthesis, dialogue and resume", async () => {
  for (const method of ["record_synthesis", "record_followup", "disposition", "resume", "stop"]) {
    for (const mutate of Object.values(semanticMutations)) {
      const test = await persistedReview(
        "semantic",
        method === "resume" ? "stopped" : method === "record_synthesis" ? "synthesizing" : "dialogue",
      );
      mutate(test);
      await assertRejects(() => model.methods[method]!.execute(input(method, test), test.context));
      assertEquals(test.writes, []);
    }
  }
});

Deno.test("cycle 11: ingress and persisted V2 assessments share the same inventory and semantic validator", async () => {
  for (const mutate of [...Object.values(inventoryMutations), ...Object.values(semanticMutations)]) {
    const test = await persistedReview("semantic");
    test.resources[test.name("reviewState")]!.phase = "assessing";
    mutate(test);
    await assertRejects(() =>
      model.methods.record_assessments!.execute({
        ...identity,
        assessments: test.resources[test.name("specialistAssessments")]!.assessments,
      }, test.context)
    );
    assertEquals(test.writes, []);
  }
});

Deno.test("cycle 11: V2 downstream readers reject forged synthesis source sets, provenance, scores, and upstream integrity", async () => {
  const mutations: Mutation[] = [
    (t) => {
      t.resources[t.name("synthesis")]!.orderedQualifiedFindingKeys = [];
    },
    (t) => {
      t.resources[t.name("synthesis")]!.sourceReferenceCounts = [];
    },
    (t) => {
      t.resources[t.name("synthesis")]!.recommendations = [];
    },
    (t) => {
      const rec = (t.resources[t.name("synthesis")]!.recommendations as Record<string, unknown>[])[0]!;
      rec.qualifiedSourceFindingKeys = [qualifiedFindingKey("lens", "domain", "invented")];
    },
    ...["score", "confidence", "epistemic", "recommendationId", "scoreExplanation"].map((key): Mutation => (t) => {
      const rec = (t.resources[t.name("synthesis")]!.recommendations as Record<string, unknown>[])[0]!;
      rec[key] = key === "score"
        ? 15
        : key === "confidence"
        ? 2
        : key === "recommendationId"
        ? "r2-99999999"
        : key === "epistemic"
        ? { ...rec.epistemic as object, factualSourceKeys: [] }
        : "forged";
    }),
    (t) => {
      t.resources[t.name("evidenceChunk", 1)]!.digest = "0".repeat(64);
    },
    (t) => {
      t.resources[t.name("evidenceManifest")]!.counts = { folders: 0, elements: 0, relationships: 0 };
    },
    (t) => {
      const snapshots = t.resources[t.name("roleSnapshots")]!.snapshots as Record<string, unknown>[];
      snapshots[0]!.evaluatorVersion = "specialist/completeness@2";
    },
    (t) => {
      delete t.resources[t.name("specialistAssessments")];
    },
  ];
  for (const method of ["record_followup", "disposition", "resume", "stop"]) {
    for (const mutate of mutations) {
      const test = await persistedReview("semantic", method === "resume" ? "stopped" : "dialogue");
      mutate(test);
      await assertRejects(() => model.methods[method]!.execute(input(method, test), test.context));
      assertEquals(test.writes, []);
    }
  }
});

Deno.test("cycle 11: valid mixed-role persisted chain produces synthesis and both role-qualified dialogue records", async () => {
  const test = await persistedReview("semantic");
  const output = await model.methods.record_synthesis!.execute(input("record_synthesis", test), test.context);
  assertEquals(output.recommendationCount, 1);
  assertEquals(test.writes.length, 2);
  await model.methods.record_followup!.execute(input("record_followup", test), test.context);
  await model.methods.disposition!.execute(input("disposition", test), test.context);
  assertEquals(test.writes.length, 4);
  assertEquals(test.resources[test.name("reviewState")]!.phase, "dialogue");
});

Deno.test("cycle 11: V2 lifecycle rejects orphan downstream records, missing revisions and phase promotion without writes", async () => {
  for (const method of ["record_synthesis", "record_followup", "disposition", "resume", "stop"]) {
    const test = await persistedReview(
      "semantic",
      method === "resume" ? "stopped" : method === "record_synthesis" ? "synthesizing" : "dialogue",
    );
    delete test.resources[test.name("reviewState")]!.publishedRevision;
    await assertRejects(() => model.methods[method]!.execute(input(method, test), test.context));
    assertEquals(test.writes, []);
  }
  const test = await persistedReview("semantic", "dialogue");
  test.resources[test.name("reviewState")]!.phase = "assessing";
  await assertRejects(() => model.methods.stop!.execute(identity, test.context));
  assertEquals(test.writes, []);
});

Deno.test("cycle 11: V1 consumed assessments require complete canonical selected inventory, without changing legacy dialogue prerequisites", async () => {
  const reviewId = "legacy-semantic";
  const assessment = {
    specialist: "completeness",
    modelId: "model-1",
    publishedRevision: 7,
    findings: [],
    strengths: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
  const other = { ...assessment, specialist: "documentationClarity" };
  for (
    const assessments of [[], [assessment], [assessment, assessment], [other, assessment], [assessment, other, {
      ...assessment,
      specialist: "derivedRelationships",
    }], [assessment, { ...other, publishedRevision: 8 }]]
  ) {
    const test = await persistedReview(reviewId);
    test.resources[`reviewState-${reviewId}-e1-s0`] = {
      reviewId,
      epoch: 1,
      phase: "synthesizing",
      modelId: "model-1",
      publishedRevision: 7,
      expectedGroups: ["Application"],
      selectedSpecialists: ["completeness", "documentationClarity"],
      updatedAt: assessment.completedAt,
    };
    test.resources[`specialistAssessments-${reviewId}-e1-s0`] = {
      reviewId,
      epoch: 1,
      modelId: "model-1",
      publishedRevision: 7,
      assessments,
      recordedAt: assessment.completedAt,
    };
    await assertRejects(() =>
      model.methods.record_synthesis!.execute({
        reviewId,
        epoch: 1,
        synthesis: {
          reviewId,
          epoch: 1,
          modelId: "model-1",
          publishedRevision: 7,
          sourceFindingIds: [],
          strengths: [],
          recommendations: [],
          synthesizedAt: assessment.completedAt,
        },
      }, test.context)
    );
    assertEquals(test.writes, []);
  }
});

Deno.test("cycle 11: a matched lens and specialist can jointly authorize their persisted mixed recommendation", async () => {
  const test = await persistedReview("semantic");
  const chunk = test.resources[test.name("evidenceChunk", 1)]!;
  const items = chunk.items as Record<string, unknown>[];
  items[0]!.properties = { architectureReviewLens: "domain" };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(items)));
  chunk.digest = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const lens = test.assessments[1]!;
  if (lens.roleKind !== "lens") throw new Error("fixture must include lens");
  lens.applicabilityRationale = "declared concern predicate matched";
  const key = qualifiedFindingKey("lens", "domain", "concern");
  lens.findings = [{
    findingKey: key,
    localFindingId: "concern",
    roleKind: "lens",
    roleId: "domain",
    category: "interpretation",
    epistemicKind: "heuristic",
    title: "Concern",
    statement: "Investigate concern",
    canonicalIds: ["element-1"],
    citations: [{ canonicalId: "element-1" }],
    confidence: 1,
    basis: ["model marker"],
    limitations: ["heuristic only"],
  }];
  const synthesis = structuredClone(test.synthesis);
  synthesis.orderedQualifiedFindingKeys.push(key);
  synthesis.sourceReferenceCounts.push({ qualifiedFindingKey: key, count: 1 });
  synthesis.sourceReferenceCounts.sort((a, b) => a.qualifiedFindingKey.localeCompare(b.qualifiedFindingKey));
  const recommendation = synthesis.recommendations[0]!;
  recommendation.qualifiedSourceFindingKeys.push(key);
  Object.assign(recommendation.epistemic, {
    mode: "mixed",
    heuristicSourceKeys: [key],
    basisSources: [{ qualifiedFindingKey: key, basis: "model marker" }],
    limitationSources: [{ qualifiedFindingKey: key, limitation: "heuristic only" }],
    limitations: ["heuristic only"],
  });
  await model.methods.record_synthesis!.execute({ ...identity, synthesis }, test.context);
  await model.methods.record_followup!.execute({
    ...input("record_followup", test),
    roleKind: "lens",
    roleId: "domain",
  }, test.context);
  await model.methods.disposition!.execute(
    { ...input("disposition", test), roleKind: "lens", roleId: "domain" },
    test.context,
  );
  assertEquals(test.writes.length, 4);
});

Deno.test("cycle 11: V2 start cannot overwrite an orphaned immutable snapshot", async () => {
  const test = await persistedReview("semantic");
  delete test.resources[test.name("reviewState")];
  await assertRejects(() =>
    model.methods.start_review!.execute({ ...identity, selectedSpecialists: ["completeness"] }, test.context)
  );
  assertEquals(test.writes, []);
});
