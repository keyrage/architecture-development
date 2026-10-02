import { assertEquals, assertRejects } from "./_test/assert.ts";
import { collectEvidence } from "./_lib/evidence_collection.ts";
import { executeSelectedSpecialists } from "./_lib/specialist_execution.ts";
import { instanceName } from "./_lib/review_state.ts";
import { type SpecialistAssessment } from "./_lib/schemas.ts";
import { ARCHIMATE_3_2_TYPES } from "./_test/archimate_vocabulary.ts";
import { model } from "./architecture_review.ts";

const revisionDiscovery = (revision: number) => ({
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
  model: { canonicalId: "model-1", name: "synthetic", purpose: "coverage", properties: {} },
  graphContractVersion: 2,
  publishedRevision: revision,
});

const vocabularyElement = (type: string, index: number) => ({
  canonicalId: `element-${index}`,
  type,
  folderId: null,
  name: `${type} ${index}`,
  documentation: `Synthetic ${type}`,
  properties: {},
});

function pageResponse(
  modelId: string,
  revision: number,
  items: unknown[],
  nextCursor: string | null,
): Response {
  return new Response(
    JSON.stringify({
      apiVersion: "v1",
      modelId,
      publishedRevision: revision,
      items,
      nextCursor,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function vocabularyFetcher(revision: number, types: readonly string[]) {
  const elements = types.map(vocabularyElement);
  return (url: string | URL | Request): Promise<Response> => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/agent-query/v1")) {
      return Promise.resolve(new Response(JSON.stringify(revisionDiscovery(revision)), { status: 200 }));
    }
    const kind = parsed.pathname.split("/").at(-1);
    if (kind === "elements") {
      const cursor = parsed.searchParams.get("cursor");
      const start = cursor === "elements-1" ? 20 : cursor === "elements-2" ? 40 : 0;
      const items = elements.slice(start, start + 20);
      const nextCursor = start === 0 ? "elements-1" : start === 20 ? "elements-2" : null;
      return Promise.resolve(pageResponse("model-1", revision, items, nextCursor));
    }
    if (kind === "relationships") {
      return Promise.resolve(pageResponse("model-1", revision, [{
        canonicalId: "relationship-1",
        type: "Association",
        folderId: null,
        name: "synthetic association",
        documentation: "",
        properties: {},
        sourceId: "element-0",
        targetId: "element-1",
        accessType: null,
        influenceStrength: null,
        isDirected: true,
      }], null));
    }
    return Promise.resolve(pageResponse("model-1", revision, [], null));
  };
}

Deno.test("complete collection executes every ArchiMate 3.2 vocabulary type", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "review-vocabulary-endpoint-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  const writes: Record<string, unknown>[] = [];
  try {
    const result = await collectEvidence({
      reviewId: "vocabulary",
      epoch: 1,
      endpointFile,
      modelId: "model-1",
      bearerToken: "synthetic-token-never-written",
      fetcher: vocabularyFetcher(7, ARCHIMATE_3_2_TYPES),
      pageSize: 20,
    }, {
      writeResource: (_spec, _name, data) => {
        writes.push(data);
        return Promise.resolve({ name: "synthetic" });
      },
    }) as { counts: { elements: number; relationships: number }; restarted: boolean };
    assertEquals(result.counts.elements, ARCHIMATE_3_2_TYPES.length);
    assertEquals(result.counts.relationships, 1);
    assertEquals(result.restarted, false);
    assertEquals(writes.some((value) => JSON.stringify(value).includes("synthetic-token-never-written")), false);
  } finally {
    await Deno.remove(endpointFile);
  }
});

Deno.test("invalid selections are rejected and specialist execution has parallel and sequential paths", async () => {
  await assertRejects(() =>
    model.methods.start_review!.execute({
      reviewId: "invalid",
      expectedGroups: ["Application"],
      selectedSpecialists: [],
    }, testContext().context)
  );
  await assertRejects(() =>
    model.methods.start_review!.execute({
      reviewId: "invalid",
      expectedGroups: ["Application"],
      selectedSpecialists: ["not-a-specialist"],
    }, testContext().context)
  );
  await assertRejects(() =>
    model.methods.start_review!.execute({
      reviewId: "invalid",
      expectedGroups: ["Application"],
      selectedSpecialists: ["completeness", "completeness"],
    }, testContext().context)
  );

  const selected = ["completeness", "documentationClarity"] as const;
  const parallelEvents: string[] = [];
  const parallel = await executeSelectedSpecialists(selected, async (specialist) => {
    parallelEvents.push(`start:${specialist}`);
    await Promise.resolve();
    parallelEvents.push(`end:${specialist}`);
    return specialist;
  }, true);
  assertEquals(parallel, [...selected]);
  assertEquals(parallelEvents.slice(0, 2), ["start:completeness", "start:documentationClarity"]);

  const sequentialEvents: string[] = [];
  const sequential = await executeSelectedSpecialists(selected, (specialist) => {
    sequentialEvents.push(`start:${specialist}`);
    sequentialEvents.push(`end:${specialist}`);
    return Promise.resolve(specialist);
  }, false);
  assertEquals(sequential, [...selected]);
  assertEquals(sequentialEvents, [
    "start:completeness",
    "end:completeness",
    "start:documentationClarity",
    "end:documentationClarity",
  ]);
});

type TestContext = ReturnType<typeof testContext>;
function testContext(
  resources: Record<string, Record<string, unknown>> = {},
  fetcher: typeof fetch = vocabularyFetcher(7, []) as typeof fetch,
) {
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  const logs: Record<string, unknown>[] = [];
  return {
    writes,
    logs,
    resources,
    context: {
      globalArgs: {
        modelId: "model-1",
        endpointFile: "/tmp/synthetic-endpoint",
        bearerToken: "credential-that-must-not-persist",
      },
      fetcher,
      logger: {
        info: (_message: string, properties: Record<string, unknown>) => logs.push(properties),
        warning: (_message: string, properties: Record<string, unknown>) => logs.push(properties),
      },
      writeResource: (spec: string, name: string, value: Record<string, unknown>) => {
        writes.push({ spec, name, value });
        resources[name] = value;
        return Promise.resolve({ name });
      },
      readResource: (name: string) => Promise.resolve(resources[name] ?? null),
    },
  };
}

const assessment = (
  specialist: SpecialistAssessment["specialist"],
  findingId: string,
): SpecialistAssessment => ({
  specialist,
  modelId: "model-1",
  publishedRevision: 7,
  findings: [{
    findingId,
    category: "recommendation",
    title: `Finding ${findingId}`,
    statement: `Address ${findingId}`,
    canonicalIds: ["element-0"],
    citations: [{ canonicalId: "element-0" }],
    impact: 4,
    confidence: 5,
    scope: 3,
    effort: 2,
  }],
  strengths: [`Strength ${specialist}`],
  completedAt: "2026-09-21T00:00:00.000Z",
});

Deno.test("selected roles, exact synthesis, dialogue, dispositions, and durable epoch history execute", async () => {
  const test = testContext();
  await Deno.writeTextFile("/tmp/synthetic-endpoint", "http://127.0.0.1:9999");
  await model.methods.start_review!.execute({
    reviewId: "lifecycle",
    expectedGroups: ["Application", "Technology"],
    selectedSpecialists: ["documentationClarity", "completeness"],
  }, test.context);
  test.resources[instanceName("reviewState", "lifecycle", 1)] = {
    ...test.resources[instanceName("reviewState", "lifecycle", 1)],
    phase: "assessing",
    publishedRevision: 7,
    apiVersion: "v1",
    graphContractVersion: 2,
  };

  const recorded = await model.methods.record_assessments!.execute({
    reviewId: "lifecycle",
    epoch: 1,
    assessments: [assessment("documentationClarity", "finding-2"), assessment("completeness", "finding-1")],
  }, test.context);
  assertEquals(recorded.specialists, ["completeness", "documentationClarity"]);
  test.resources[instanceName("reviewState", "lifecycle", 1)] = {
    ...test.resources[instanceName("reviewState", "lifecycle", 1)],
    phase: "synthesizing",
  };
  const recommendation = (id: string, findingId: string, impact: number) => ({
    recommendationId: id,
    title: id,
    statement: `Do ${id}`,
    sourceFindingIds: [findingId],
    citations: [{ canonicalId: "element-0" }],
    impact,
    confidence: 5,
    scope: 3,
    effort: 2,
    score: 10,
    scoreExplanation: "placeholder replaced by ranking",
  });
  const synthesisResult = await model.methods.record_synthesis!.execute({
    reviewId: "lifecycle",
    epoch: 1,
    synthesis: {
      reviewId: "lifecycle",
      epoch: 1,
      modelId: "model-1",
      publishedRevision: 7,
      sourceFindingIds: ["finding-1", "finding-2"],
      strengths: ["complete selected-role strengths"],
      recommendations: [recommendation("rec-low", "finding-2", 2), recommendation("rec-high", "finding-1", 5)],
      synthesizedAt: "2026-09-21T00:00:00.000Z",
    },
  }, test.context) as { topTen: { recommendationId: string; score: number }[] };
  assertEquals(synthesisResult.topTen.map((item) => item.recommendationId), [
    "rec-high",
    "rec-low",
  ]);
  assertEquals(synthesisResult.topTen[0]!.score, 45);
  test.resources[instanceName("reviewState", "lifecycle", 1)] = {
    ...test.resources[instanceName("reviewState", "lifecycle", 1)],
    phase: "dialogue",
  };

  await model.methods.record_followup!.execute({
    reviewId: "lifecycle",
    epoch: 1,
    sequence: 1,
    recommendationId: "rec-high",
    specialist: "completeness",
    question: "Why?",
    response: "Because the evidence is complete.",
  }, test.context);
  await assertRejects(() =>
    model.methods.record_followup!.execute({
      reviewId: "lifecycle",
      epoch: 1,
      sequence: 2,
      recommendationId: "rec-high",
      specialist: "motivationStrategy",
      question: "Why?",
      response: "Not selected.",
    }, test.context)
  );
  await model.methods.disposition!.execute({
    reviewId: "lifecycle",
    epoch: 1,
    recommendationId: "rec-high",
    disposition: "accepted",
    rationale: "Accepted after specialist follow-up.",
  }, test.context);
  assertEquals(
    test.writes.some((write) => write.spec === "followup" && write.value.specialist === "completeness"),
    true,
  );
  assertEquals(
    test.writes.some((write) => write.spec === "disposition" && write.value.disposition === "accepted"),
    true,
  );

  await model.methods.stop!.execute({ reviewId: "lifecycle", epoch: 1 }, test.context);
  const resumed = await model.methods.resume!.execute({ reviewId: "lifecycle", epoch: 1 }, test.context);
  assertEquals(resumed.freshAssessmentRequired, false);
  assertEquals(resumed.epoch, 1);
  assertEquals(test.writes.some((write) => write.name === "followup-lifecycle-e1-s1"), true);

  await model.methods.stop!.execute({ reviewId: "lifecycle", epoch: 1 }, test.context);
  test.context.fetcher = vocabularyFetcher(8, ["ApplicationComponent", "ApplicationService"]);
  const freshEpoch = await model.methods.resume!.execute({ reviewId: "lifecycle", epoch: 1 }, test.context);
  assertEquals(freshEpoch.freshAssessmentRequired, true);
  assertEquals(freshEpoch.priorEpoch, 1);
  assertEquals(freshEpoch.epoch, 2);
  assertEquals(test.resources[instanceName("reviewState", "lifecycle", 1)]!.selectedSpecialists, [
    "completeness",
    "documentationClarity",
  ]);
  assertEquals(
    test.resources[instanceName("followup", "lifecycle", 1, 1)]!.response,
    "Because the evidence is complete.",
  );
  assertEquals(
    test.writes.some((write) => JSON.stringify(write.value).includes("credential-that-must-not-persist")),
    false,
  );
  assertEquals(test.logs.some((log) => JSON.stringify(log).includes("credential-that-must-not-persist")), false);

  await model.methods.start_review!.execute({
    reviewId: "lifecycle",
    epoch: 3,
    expectedGroups: ["Application"],
    selectedSpecialists: ["derivedRelationships"],
  }, test.context);
  assertEquals(test.resources[instanceName("reviewState", "lifecycle", 3)]!.selectedSpecialists, [
    "derivedRelationships",
  ]);
});

Deno.test("collection retries one moved revision and fails closed on a second move", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "review-restart-endpoint-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  try {
    let calls = 0;
    const restarted = await collectEvidence({
      reviewId: "restart",
      epoch: 1,
      endpointFile,
      modelId: "model-1",
      bearerToken: "restart-secret",
      fetcher: (_url, _init) => {
        calls++;
        if (calls === 2) return Promise.resolve(new Response("", { status: 409 }));
        return vocabularyFetcher(8, ["ApplicationComponent", "ApplicationService"])(_url);
      },
    }, { writeResource: (_spec, name) => Promise.resolve({ name }) });
    assertEquals(restarted.restarted, true);
    assertEquals(restarted.revision, 8);

    let failedCalls = 0;
    await assertRejects(
      () =>
        collectEvidence({
          reviewId: "restart-fail",
          epoch: 1,
          endpointFile,
          modelId: "model-1",
          bearerToken: "restart-secret",
          fetcher: (_url, _init) => {
            failedCalls++;
            return Promise.resolve(new Response("", { status: failedCalls === 1 || failedCalls === 2 ? 409 : 200 }));
          },
        }, { writeResource: (_spec, name) => Promise.resolve({ name }) }),
      undefined,
      "revision moved",
    );
  } finally {
    await Deno.remove(endpointFile);
  }
});
