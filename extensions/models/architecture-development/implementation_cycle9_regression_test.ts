import { assertEquals, assertRejects } from "./_test/assert.ts";
import { DispositionSchema, FollowupSchema, SynthesisSchema } from "./_lib/schemas.ts";
import { qualifiedFindingKey } from "./_lib/lenses.ts";
import { model } from "./architecture_review.ts";

const NOW = "2026-01-01T00:00:00.000Z";

type Stored = Record<string, Record<string, unknown>>;

function testContext() {
  const resources: Stored = {};
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  return {
    resources,
    writes,
    context: {
      globalArgs: { modelId: "model-1", endpointFile: "/tmp/unused", bearerToken: "secret" },
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

function v1Fixture(reviewId: string) {
  const test = testContext();
  test.resources[`reviewState-${reviewId}-e1-s0`] = {
    reviewId,
    epoch: 1,
    phase: "dialogue",
    modelId: "model-1",
    publishedRevision: 7,
    expectedGroups: ["Application", "Technology"],
    selectedSpecialists: ["completeness"],
    updatedAt: NOW,
  };
  test.resources[`synthesis-${reviewId}-e1-s0`] = {
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 7,
    sourceFindingIds: ["finding-1"],
    strengths: [],
    recommendations: [{
      recommendationId: "persisted-rec",
      title: "Persisted recommendation",
      statement: "Use only a recommendation from the durable synthesis.",
      sourceFindingIds: ["finding-1"],
      citations: [],
      impact: 1,
      confidence: 1,
      scope: 1,
      effort: 1,
      score: 24,
      scoreExplanation: "V1 score.",
    }],
    synthesizedAt: NOW,
  };
  return test;
}

const followup = (reviewId: string, recommendationId: string) => ({
  reviewId,
  epoch: 1,
  sequence: 1,
  recommendationId,
  specialist: "completeness",
  question: "Why?",
  response: "Because the synthesis persisted it.",
});
const disposition = (reviewId: string, recommendationId: string) => ({
  reviewId,
  epoch: 1,
  recommendationId,
  disposition: "accepted",
  rationale: "Accepted after dialogue.",
});

Deno.test("cycle 9: V1 dialogue rejects invented recommendation IDs before any write", async () => {
  for (const methodName of ["record_followup", "disposition"] as const) {
    const reviewId = `v1-invented-${methodName}`;
    const test = v1Fixture(reviewId);
    const input = methodName === "record_followup"
      ? followup(reviewId, "invented-rec")
      : disposition(reviewId, "invented-rec");
    await assertRejects(() => model.methods[methodName]!.execute(input, test.context));
    assertEquals(test.writes, []);
  }
});

Deno.test("cycle 9: V1 dialogue accepts persisted recommendations with exact legacy records and outputs", async () => {
  const reviewId = "v1-existing";
  const test = v1Fixture(reviewId);
  const followupResult = await model.methods.record_followup!.execute({
    ...followup(reviewId, "persisted-rec"),
    unknownLegacyHostField: true,
  }, test.context);
  assertEquals(followupResult, {
    dataHandles: [{ name: `followup-${reviewId}-e1-s1` }],
    specialist: "completeness",
  });
  const dispositionResult = await model.methods.disposition!.execute({
    ...disposition(reviewId, "persisted-rec"),
    unknownLegacyHostField: true,
  }, test.context);
  assertEquals(dispositionResult, {
    dataHandles: [{ name: `disposition-${reviewId}-e1-spersisted-rec` }],
    disposition: "accepted",
  });
  const followupWrite = test.writes.find((write) => write.spec === "followup")!;
  const dispositionWrite = test.writes.find((write) => write.spec === "disposition")!;
  assertEquals(followupWrite.name, `followup-${reviewId}-e1-s1`);
  assertEquals(dispositionWrite.name, `disposition-${reviewId}-e1-spersisted-rec`);
  assertEquals(FollowupSchema.safeParse(followupWrite.value).success, true);
  assertEquals(DispositionSchema.safeParse(dispositionWrite.value).success, true);
  assertEquals("unknownLegacyHostField" in followupWrite.value, false);
  assertEquals("unknownLegacyHostField" in dispositionWrite.value, false);
  assertEquals("recordVersion" in followupWrite.value, false);
  assertEquals("recordVersion" in dispositionWrite.value, false);
});

Deno.test("cycle 9: V1 dialogue fails closed on missing, malformed, or identity-mismatched synthesis", async () => {
  const mutations: Array<(value: Record<string, unknown>) => Record<string, unknown> | null> = [
    () => null,
    (value) => ({ ...value, unknown: true }),
    (value) => ({ ...value, reviewId: "other-review" }),
    (value) => ({ ...value, epoch: 2 }),
    (value) => ({ ...value, modelId: "other-model" }),
    (value) => ({ ...value, publishedRevision: 8 }),
  ];
  for (const [index, mutate] of mutations.entries()) {
    for (const methodName of ["record_followup", "disposition"] as const) {
      const reviewId = `v1-bad-${index}-${methodName}`;
      const test = v1Fixture(reviewId);
      const synthesisName = `synthesis-${reviewId}-e1-s0`;
      const changed = mutate(test.resources[synthesisName]!);
      if (changed === null) delete test.resources[synthesisName];
      else test.resources[synthesisName] = changed;
      const input = methodName === "record_followup"
        ? followup(reviewId, "persisted-rec")
        : disposition(reviewId, "persisted-rec");
      await assertRejects(() => model.methods[methodName]!.execute(input, test.context));
      assertEquals(test.writes, []);
    }
  }
});

Deno.test("cycle 9: V2 dialogue remains role-qualified and rejects invented recommendations", async () => {
  const test = testContext();
  const reviewId = "cycle9-v2-control";
  const source = qualifiedFindingKey("specialist", "completeness", "finding-1");
  test.resources[`reviewStateV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    phase: "dialogue",
    modelId: "model-1",
    publishedRevision: 7,
    expectedGroups: ["Application", "Technology"],
    selectedSpecialists: ["completeness"],
    selectedLenses: [],
    roleSnapshotResourceName: `roleSnapshotsV2-${reviewId}-e1-s0`,
    updatedAt: NOW,
  };
  test.resources[`synthesisV2-${reviewId}-e1-s0`] = {
    recordVersion: 2,
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 7,
    orderedQualifiedFindingKeys: [source],
    sourceReferenceCounts: [{ qualifiedFindingKey: source, count: 1 }],
    strengths: [],
    recommendations: [{
      recommendationId: "r2-00000001",
      title: "Persisted recommendation",
      statement: "Use the persisted V2 recommendation.",
      qualifiedSourceFindingKeys: [source],
      citations: [],
      impact: 1,
      confidence: 1,
      scope: 1,
      effort: 1,
      score: 24,
      scoreExplanation: "V2 score.",
      epistemic: {
        mode: "factual",
        factualSourceKeys: [source],
        heuristicSourceKeys: [],
        basisSources: [],
        limitationSources: [],
        limitations: [],
      },
    }],
    synthesizedAt: NOW,
  };
  await assertRejects(() =>
    model.methods.record_followup!.execute({
      schemaVersion: 2,
      reviewId,
      epoch: 1,
      sequence: 1,
      recommendationId: "r2-99999999",
      roleKind: "specialist",
      roleId: "completeness",
      question: "Why?",
      response: "No persisted recommendation.",
    }, test.context)
  );
  await assertRejects(() =>
    model.methods.disposition!.execute({
      schemaVersion: 2,
      reviewId,
      epoch: 1,
      recommendationId: "r2-00000001",
      roleKind: "lens",
      roleId: "domain",
      disposition: "accepted",
      rationale: "Wrong role.",
    }, test.context)
  );
  assertEquals(test.writes, []);
  assertEquals(SynthesisSchema.safeParse(test.resources[`synthesisV2-${reviewId}-e1-s0`]).success, false);
});
