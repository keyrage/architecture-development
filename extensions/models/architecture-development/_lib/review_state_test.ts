import { assertEquals, assertRejects } from "../_test/assert.ts";
import { assertSynthesisCoverage, canonicalSelection, instanceName, normalizeAssessments } from "./review_state.ts";
import { type ReviewState, type SpecialistAssessment } from "./schemas.ts";

const state: ReviewState = {
  reviewId: "r1",
  epoch: 1,
  phase: "assessing",
  modelId: "m1",
  publishedRevision: 4,
  expectedGroups: ["Application", "Technology"],
  selectedSpecialists: ["completeness", "documentationClarity"],
  updatedAt: "2026-09-21T00:00:00.000Z",
};
const assessment = (specialist: "completeness" | "documentationClarity", findingId: string): SpecialistAssessment => ({
  specialist,
  modelId: "m1",
  publishedRevision: 4,
  findings: [{
    findingId,
    category: "observation",
    title: findingId,
    statement: "fact",
    canonicalIds: ["e1"],
    citations: [],
  }],
  strengths: [],
  completedAt: "2026-09-21T00:00:00.000Z",
});

Deno.test("selection is non-empty and canonicalized", () => {
  assertEquals(canonicalSelection(["documentationClarity", "completeness"]), ["completeness", "documentationClarity"]);
  assertEquals(instanceName("reviewState", "r1", 2), "reviewState-r1-e2-s0");
});
Deno.test("assessment persistence normalizes shuffled parallel completion", () => {
  assertEquals(
    normalizeAssessments([assessment("documentationClarity", "f2"), assessment("completeness", "f1")], state).map((
      item,
    ) => item.specialist),
    ["completeness", "documentationClarity"],
  );
});
Deno.test("assessment rejects missing and unselected roles", async () => {
  await assertRejects(() => Promise.resolve(normalizeAssessments([assessment("completeness", "f1")], state)));
  await assertRejects(() =>
    Promise.resolve(
      normalizeAssessments([assessment("completeness", "f1"), assessment("documentationClarity", "f2"), {
        ...assessment("completeness", "f3"),
      }], state),
    )
  );
});
Deno.test("synthesis requires exact selected finding coverage", () => {
  const assessments = [assessment("completeness", "f1"), assessment("documentationClarity", "f2")];
  const base = {
    reviewId: "r1",
    epoch: 1,
    modelId: "m1",
    publishedRevision: 4,
    strengths: [],
    synthesizedAt: "2026-09-21T00:00:00.000Z",
  };
  const recommendation = {
    recommendationId: "rec-f1",
    title: "rec",
    statement: "do",
    sourceFindingIds: ["f1", "f2"],
    citations: [],
    impact: 3,
    confidence: 3,
    scope: 3,
    effort: 3,
    score: 30,
    scoreExplanation: "score",
  };
  assertEquals(
    assertSynthesisCoverage(assessments, { ...base, sourceFindingIds: ["f1", "f2"], recommendations: [recommendation] })
      .sourceFindingIds.length,
    2,
  );
  // An omitted selected finding is rejected before persistence.
  try {
    assertSynthesisCoverage(assessments, {
      ...base,
      sourceFindingIds: ["f1"],
      recommendations: [{ ...recommendation, sourceFindingIds: ["f1"] }],
    });
    throw new Error("expected rejection");
  } catch (error) {
    assertEquals(String(error).includes("cover"), true);
  }
});
