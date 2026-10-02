import { assertEquals, assertRejects } from "./_test/assert.ts";
import { persistedReview } from "./_test/persisted_review.ts";
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

async function v2DialogueFixture() {
  const test = testContext();
  const reviewId = "cycle7-dialogue";
  const complete = await persistedReview(reviewId, "dialogue", true, true, 1);
  Object.assign(test.resources, complete.resources);
  return { test, reviewId };
}

Deno.test("cycle 7: public V2 dialogue persists strict records without routing metadata", async () => {
  const { test, reviewId } = await v2DialogueFixture();
  const followup = await model.methods.record_followup!.execute({
    schemaVersion: 2,
    reviewId,
    epoch: 1,
    sequence: 1,
    recommendationId: "r2-00000001",
    roleKind: "specialist",
    roleId: "completeness",
    question: "What supports this recommendation?",
    response: "The persisted specialist finding.",
  }, test.context);
  assertEquals(followup, {
    schemaVersion: 2,
    dataHandles: [{ name: `followupV2-${reviewId}-e1-s1` }],
    roleKind: "specialist",
    roleId: "completeness",
  });

  const disposition = await model.methods.disposition!.execute({
    schemaVersion: 2,
    reviewId,
    epoch: 1,
    recommendationId: "r2-00000001",
    roleKind: "specialist",
    roleId: "completeness",
    disposition: "accepted",
    rationale: "Accepted after role-qualified dialogue.",
  }, test.context);
  assertEquals(disposition, {
    schemaVersion: 2,
    dataHandles: [{ name: `dispositionV2-${reviewId}-e1-sr2-00000001` }],
    disposition: "accepted",
    roleKind: "specialist",
    roleId: "completeness",
  });

  const followupRecord = test.writes.find((write) => write.spec === "followupV2")!.value;
  const dispositionRecord = test.writes.find((write) => write.spec === "dispositionV2")!.value;
  assertEquals(Object.keys(followupRecord).sort(), [
    "epoch",
    "question",
    "recommendationId",
    "recordVersion",
    "recordedAt",
    "response",
    "reviewId",
    "roleId",
    "roleKind",
    "sequence",
  ]);
  assertEquals(Object.keys(dispositionRecord).sort(), [
    "disposition",
    "epoch",
    "rationale",
    "recommendationId",
    "recordVersion",
    "recordedAt",
    "reviewId",
    "roleId",
    "roleKind",
  ]);
  assertEquals("schemaVersion" in followupRecord, false);
  assertEquals("schemaVersion" in dispositionRecord, false);
  assertEquals(followupRecord.recordVersion, 2);
  assertEquals(dispositionRecord.recordVersion, 2);
});

Deno.test("cycle 7: public V2 dialogue rejects unknown fields and incorrect role/recommendation bindings", async () => {
  const { test, reviewId } = await v2DialogueFixture();
  const followup = {
    schemaVersion: 2,
    reviewId,
    epoch: 1,
    sequence: 1,
    recommendationId: "r2-00000001",
    roleKind: "specialist",
    roleId: "completeness",
    question: "Why?",
    response: "Because.",
  } as const;
  const disposition = {
    schemaVersion: 2,
    reviewId,
    epoch: 1,
    recommendationId: "r2-00000001",
    roleKind: "specialist",
    roleId: "completeness",
    disposition: "accepted",
    rationale: "Accepted.",
  } as const;

  await assertRejects(() => model.methods.record_followup!.execute({ ...followup, unknown: true }, test.context));
  await assertRejects(() => model.methods.disposition!.execute({ ...disposition, unknown: true }, test.context));
  await assertRejects(() =>
    model.methods.record_followup!.execute({ ...followup, roleKind: "lens", roleId: "domain" }, test.context)
  );
  await assertRejects(() =>
    model.methods.disposition!.execute({ ...disposition, roleKind: "lens", roleId: "domain" }, test.context)
  );
  await assertRejects(() =>
    model.methods.record_followup!.execute({ ...followup, roleKind: "lens", roleId: "security" }, test.context)
  );
  await assertRejects(() =>
    model.methods.disposition!.execute({ ...disposition, recommendationId: "r2-99999999" }, test.context)
  );
  assertEquals(test.writes.some((write) => write.spec === "followupV2" || write.spec === "dispositionV2"), false);
});

Deno.test("cycle 7: untagged public V1 dialogue remains permissive at its envelope and exact when persisted", async () => {
  const test = testContext();
  const reviewId = "cycle7-v1";
  await model.methods.start_review!.execute({ reviewId, selectedSpecialists: ["completeness"] }, test.context);
  const stateName = `reviewState-${reviewId}-e1-s0`;
  test.resources[stateName] = {
    ...test.resources[stateName]!,
    phase: "dialogue",
    publishedRevision: 1,
  };
  test.resources[`synthesis-${reviewId}-e1-s0`] = {
    reviewId,
    epoch: 1,
    modelId: "model-1",
    publishedRevision: 1,
    sourceFindingIds: ["finding-1"],
    strengths: [],
    recommendations: [{
      recommendationId: "recommendation-1",
      title: "Keep V1",
      statement: "Keep the V1 dialogue contract unchanged.",
      sourceFindingIds: ["finding-1"],
      citations: [],
      impact: 1,
      confidence: 1,
      scope: 1,
      effort: 1,
      score: 24,
      scoreExplanation: "Legacy score.",
    }],
    synthesizedAt: NOW,
  };

  const followup = await model.methods.record_followup!.execute({
    reviewId,
    epoch: 1,
    sequence: 1,
    recommendationId: "recommendation-1",
    specialist: "completeness",
    question: "Still V1?",
    response: "Yes.",
    unknownLegacyHostField: true,
  }, test.context);
  assertEquals(followup, {
    dataHandles: [{ name: `followup-${reviewId}-e1-s1` }],
    specialist: "completeness",
  });
  const disposition = await model.methods.disposition!.execute({
    reviewId,
    epoch: 1,
    recommendationId: "recommendation-1",
    disposition: "undecided",
    rationale: "Legacy behavior remains unchanged.",
    unknownLegacyHostField: true,
  }, test.context);
  assertEquals(disposition, {
    dataHandles: [{ name: `disposition-${reviewId}-e1-srecommendation-1` }],
    disposition: "undecided",
  });
  for (const record of test.writes.filter((write) => write.spec === "followup" || write.spec === "disposition")) {
    assertEquals("schemaVersion" in record.value, false);
    assertEquals("recordVersion" in record.value, false);
    assertEquals("unknownLegacyHostField" in record.value, false);
  }
});
