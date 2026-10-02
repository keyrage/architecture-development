import { assertEquals, assertRejects } from "./_test/assert.ts";
import { model } from "./architecture_review.ts";

function context(resources: Record<string, Record<string, unknown>> = {}) {
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  return {
    writes,
    context: {
      globalArgs: { modelId: "model-1", endpointFile: "/tmp/endpoint", bearerToken: "never-persist-this-value" },
      logger: { info: () => {}, warning: () => {} },
      writeResource: (spec: string, name: string, value: Record<string, unknown>) => {
        writes.push({ spec, name, value });
        resources[name] = value;
        return Promise.resolve({ name });
      },
      readResource: (name: string) => Promise.resolve(resources[name] ?? null),
    },
  };
}

Deno.test("public method inputs strip merged globals but reject invalid declared values", () => {
  const mergedGlobals = {
    modelId: "model-1",
    endpointFile: "/tmp/endpoint",
    bearerToken: "must-not-be-retained",
  };
  const finding = {
    findingId: "finding-1",
    category: "observation",
    title: "Coverage",
    statement: "Coverage is visible.",
    canonicalIds: ["element-1"],
    citations: [],
  };
  const assessment = {
    specialist: "completeness",
    modelId: "model-1",
    publishedRevision: 1,
    findings: [finding],
    strengths: ["Clear scope"],
    completedAt: new Date().toISOString(),
  };
  const recommendation = {
    recommendationId: "recommendation-1",
    title: "Keep coverage",
    statement: "Keep coverage visible.",
    sourceFindingIds: ["finding-1"],
    citations: [],
    impact: 1,
    confidence: 1,
    scope: 1,
    effort: 1,
    score: 24,
    scoreExplanation: "Low-impact, low-effort recommendation.",
  };
  const synthesis = {
    reviewId: "review1",
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    sourceFindingIds: ["finding-1"],
    strengths: ["Clear scope"],
    recommendations: [recommendation],
    synthesizedAt: new Date().toISOString(),
  };
  const validInputs: Record<string, Record<string, unknown>> = {
    start_review: { reviewId: "review1", expectedGroups: ["Application"] },
    status: { reviewId: "review1", epoch: 1 },
    collect_evidence: { reviewId: "review1", epoch: 1 },
    record_assessments: { reviewId: "review1", epoch: 1, assessments: [assessment] },
    record_synthesis: { reviewId: "review1", epoch: 1, synthesis },
    record_followup: {
      reviewId: "review1",
      epoch: 1,
      sequence: 1,
      recommendationId: "recommendation-1",
      specialist: "completeness",
      question: "Why?",
      response: "Because.",
    },
    disposition: {
      reviewId: "review1",
      epoch: 1,
      recommendationId: "recommendation-1",
      disposition: "undecided",
      rationale: "Needs discussion.",
    },
    stop: { reviewId: "review1", epoch: 1 },
    resume: { reviewId: "review1", epoch: 1 },
  };
  for (const [name, input] of Object.entries(validInputs)) {
    const method = (model.methods as unknown as Record<
      string,
      { arguments: { safeParse: (value: unknown) => { success: boolean; data?: Record<string, unknown> } } }
    >)[name]!;
    const parsed = method.arguments.safeParse({ ...input, ...mergedGlobals });
    assertEquals(parsed.success, true, `${name} should accept host-merged globals`);
    assertEquals(parsed.data && "bearerToken" in parsed.data, false, `${name} must strip bearerToken`);
    assertEquals(parsed.data && "modelId" in parsed.data, false, `${name} must strip modelId`);
    const invalid = method.arguments.safeParse({ ...input, epoch: "not-a-number", ...mergedGlobals });
    assertEquals(invalid.success, false, `${name} must reject invalid declared fields`);
  }
});

Deno.test("start_review defaults all specialists and stores no credential", async () => {
  const test = context();
  await model.methods.start_review!.execute(
    { reviewId: "review1", expectedGroups: ["Application", "Technology"] },
    test.context,
  );
  assertEquals(test.writes[0]!.value.selectedSpecialists, [
    "completeness",
    "crossLayerTraceability",
    "documentationClarity",
    "motivationStrategy",
    "repositoryAlignment",
    "derivedRelationships",
  ]);
  assertEquals(JSON.stringify(test.writes).includes("never-persist-this-value"), false);
});

Deno.test("start_review accepts a strict subset and rejects an existing epoch", async () => {
  const test = context();
  await model.methods.start_review!.execute({
    reviewId: "review1",
    expectedGroups: ["Application"],
    selectedSpecialists: ["documentationClarity"],
  }, test.context);
  await assertRejects(() =>
    model.methods.start_review!.execute({
      reviewId: "review1",
      expectedGroups: ["Application"],
      selectedSpecialists: ["documentationClarity"],
    }, test.context)
  );
});
