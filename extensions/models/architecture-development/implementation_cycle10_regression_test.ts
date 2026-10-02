import { assertEquals, assertRejects } from "./_test/assert.ts";
import { model } from "./architecture_review.ts";
import { persistedReview } from "./_test/persisted_review.ts";

const NOW = "2026-01-01T00:00:00.000Z";
async function fixture(reviewId: string, phase: "synthesizing" | "dialogue") {
  return await persistedReview(reviewId, phase, false, phase === "dialogue");
}

const synthesisInput = (reviewId: string) => ({
  schemaVersion: 2,
  reviewId,
  epoch: 1,
  synthesis: {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 7,
    orderedQualifiedFindingKeys: [],
    sourceReferenceCounts: [],
    strengths: [],
    recommendations: [],
    synthesizedAt: NOW,
  },
});
const followupInput = (reviewId: string) => ({
  schemaVersion: 2,
  reviewId,
  epoch: 1,
  sequence: 1,
  recommendationId: "r2-00000001",
  roleKind: "specialist",
  roleId: "completeness",
  question: "Why?",
  response: "Persisted.",
});
const dispositionInput = (reviewId: string) => ({
  schemaVersion: 2,
  reviewId,
  epoch: 1,
  recommendationId: "r2-00000001",
  roleKind: "specialist",
  roleId: "completeness",
  disposition: "accepted",
  rationale: "Confirmed.",
});

Deno.test("cycle 10: routed synthesis rejects every persisted assessment identity mismatch and malformed record without writes", async () => {
  for (
    const [key, value] of [
      ["reviewId", "different"],
      ["epoch", 2],
      ["modelId", "different"],
      ["publishedRevision", 8],
      ["unknown", true],
    ] as const
  ) {
    const reviewId = `assessment-${key}`;
    const test = await fixture(reviewId, "synthesizing");
    test.resources[`specialistAssessmentsV2-${reviewId}-e1-s0`]![key] = value;
    await assertRejects(() => model.methods.record_synthesis!.execute(synthesisInput(reviewId), test.context));
    assertEquals(test.writes, []);
  }
  const reviewId = "assessment-valid";
  const test = await fixture(reviewId, "synthesizing");
  const output = await model.methods.record_synthesis!.execute(synthesisInput(reviewId), test.context);
  assertEquals(output.recommendationCount, 0);
  assertEquals(test.writes.length, 2);
});

Deno.test("cycle 10: routed dialogue rejects every persisted synthesis identity mismatch and malformed record without writes", async () => {
  for (const method of ["record_followup", "disposition"] as const) {
    for (
      const [key, value] of [
        ["reviewId", "different"],
        ["epoch", 2],
        ["modelId", "different"],
        ["publishedRevision", 8],
        ["unknown", true],
      ] as const
    ) {
      const reviewId = `${method}-${key}`;
      const test = await fixture(reviewId, "dialogue");
      test.resources[`synthesisV2-${reviewId}-e1-s0`]![key] = value;
      const input = method === "record_followup" ? followupInput(reviewId) : dispositionInput(reviewId);
      await assertRejects(() => model.methods[method]!.execute(input, test.context));
      assertEquals(test.writes, []);
    }
    const reviewId = `${method}-valid`;
    const test = await fixture(reviewId, "dialogue");
    const input = method === "record_followup" ? followupInput(reviewId) : dispositionInput(reviewId);
    const output = await model.methods[method]!.execute(input, test.context);
    assertEquals(output.schemaVersion, 2);
    assertEquals(test.writes.length, 1);
  }
});

Deno.test("cycle 10: routed state and V1 assessment/synthesis reads bind identity before writes", async () => {
  for (const schemaVersion of [1, 2]) {
    for (const key of ["reviewId", "epoch", "modelId"] as const) {
      const reviewId = `state-${schemaVersion}-${key}`;
      const test = await fixture(reviewId, "dialogue");
      const stateName = `reviewStateV2-${reviewId}-e1-s0`;
      if (schemaVersion === 1) {
        test.resources[`reviewState-${reviewId}-e1-s0`] = {
          reviewId,
          epoch: 1,
          phase: "dialogue",
          modelId: "model-1",
          publishedRevision: 7,
          expectedGroups: ["Application"],
          selectedSpecialists: ["completeness"],
          updatedAt: NOW,
        };
      }
      const name = schemaVersion === 1 ? `reviewState-${reviewId}-e1-s0` : stateName;
      test.resources[name]![key] = key === "epoch" ? 2 : "different";
      const input = schemaVersion === 1 ? { reviewId, epoch: 1 } : { schemaVersion: 2, reviewId, epoch: 1 };
      await assertRejects(() => model.methods.status!.execute(input, test.context));
      assertEquals(test.writes, []);
    }
  }
});

Deno.test("cycle 10: V1 synthesis binds persisted assessment and caller identity with zero-write rejection", async () => {
  const reviewId = "v1-assessment-identity";
  const makeTest = async () => {
    const test = await fixture(reviewId, "synthesizing");
    test.resources[`reviewState-${reviewId}-e1-s0`] = {
      reviewId,
      epoch: 1,
      phase: "synthesizing",
      modelId: "model-1",
      publishedRevision: 7,
      expectedGroups: ["Application"],
      selectedSpecialists: ["completeness"],
      updatedAt: NOW,
    };
    test.resources[`specialistAssessments-${reviewId}-e1-s0`] = {
      reviewId,
      epoch: 1,
      modelId: "model-1",
      publishedRevision: 7,
      assessments: [{
        specialist: "completeness",
        modelId: "model-1",
        publishedRevision: 7,
        findings: [],
        strengths: [],
        completedAt: NOW,
      }],
      recordedAt: NOW,
    };
    return test;
  };
  const input = {
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
      synthesizedAt: NOW,
    },
  };
  for (const key of ["reviewId", "epoch", "modelId", "publishedRevision", "unknown"] as const) {
    const test = await makeTest();
    test.resources[`specialistAssessments-${reviewId}-e1-s0`]![key] = key === "epoch"
      ? 2
      : key === "publishedRevision"
      ? 8
      : key === "unknown"
      ? true
      : "different";
    await assertRejects(() => model.methods.record_synthesis!.execute(input, test.context));
    assertEquals(test.writes, []);
  }
  for (const key of ["reviewId", "epoch"] as const) {
    const test = await makeTest();
    const changed = { ...input, synthesis: { ...input.synthesis, [key]: key === "epoch" ? 2 : "different" } };
    await assertRejects(() => model.methods.record_synthesis!.execute(changed, test.context));
    assertEquals(test.writes, []);
  }
  const valid = await makeTest();
  const output = await model.methods.record_synthesis!.execute(input, valid.context);
  assertEquals(output.recommendationCount, 0);
  assertEquals(valid.writes.length, 2);
});
