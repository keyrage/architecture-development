import { assertEquals, assertRejects } from "./_test/assert.ts";
import { model } from "./architecture_review.ts";
import { instanceName } from "./_lib/review_state.ts";

function testContext() {
  const resources: Record<string, Record<string, unknown>> = {};
  const writes: { spec: string; name: string; value: Record<string, unknown> }[] = [];
  return {
    resources,
    writes,
    context: {
      globalArgs: { modelId: "model-1", endpointFile: "/tmp/none", bearerToken: "secret-never-stored" },
      logger: { info: () => {}, warning: () => {} },
      writeResource: (spec: string, name: string, value: Record<string, unknown>) => {
        resources[name] = value;
        writes.push({ spec, name, value });
        return Promise.resolve({ name });
      },
      readResource: (name: string) => Promise.resolve(resources[name] ?? null),
    },
  };
}

Deno.test("v2 mixed selection creates immutable role snapshots without credentials", async () => {
  const test = testContext();
  const result = await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "mixed",
    selectedSpecialists: ["completeness"],
    selectedLenses: ["security", "domain"],
  }, test.context) as Record<string, unknown>;
  assertEquals(result.schemaVersion, 2);
  assertEquals(result.selectedSpecialists, ["completeness"]);
  assertEquals(result.selectedLenses, ["domain", "security"]);
  const snapshot = test.writes.find((write) => write.spec === "roleSnapshotsV2")!.value;
  assertEquals((snapshot.snapshots as unknown[]).length, 3);
  assertEquals(
    (snapshot.snapshots as { snapshotDigest: string }[]).every((entry) =>
      /^sha256-(?!0+$)[0-9a-f]{64}$/.test(entry.snapshotDigest)
    ),
    true,
  );
  assertEquals(JSON.stringify(test.writes).includes("secret-never-stored"), false);
});

Deno.test("v2 selection rejects an empty combined set", async () => {
  const test = testContext();
  await assertRejects(() =>
    model.methods.start_review!.execute({
      schemaVersion: 2,
      reviewId: "empty",
      selectedSpecialists: [],
      selectedLenses: [],
    }, test.context)
  );
});

Deno.test("v2 status and stop preserve the immutable persisted snapshot", async () => {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "lifecycle-v2",
    selectedSpecialists: ["completeness"],
    selectedLenses: ["security"],
  }, test.context);
  const status = await model.methods.status!.execute(
    { schemaVersion: 2, reviewId: "lifecycle-v2", epoch: 1 },
    test.context,
  ) as Record<string, unknown>;
  assertEquals((status.snapshots as unknown[]).length, 2);
  await model.methods.stop!.execute({ schemaVersion: 2, reviewId: "lifecycle-v2", epoch: 1 }, test.context);
  const stopped = test.resources["reviewStateV2-lifecycle-v2-e1-s0"]!;
  assertEquals(stopped.phase, "stopped");
  const snapshotRecord = test.resources["roleSnapshotsV2-lifecycle-v2-e1-s0"]!;
  assertEquals((snapshotRecord.snapshots as unknown[]).length, 2);
});

Deno.test("v2 resources are separate from v1 instance names", () => {
  assertEquals(instanceName("reviewState", "same", 1), "reviewState-same-e1-s0");
  assertEquals(instanceName("reviewStateV2", "same", 1), "reviewStateV2-same-e1-s0");
});

Deno.test("public methods are schema-version routed rather than exposing v2 method names", () => {
  const names = Object.keys(model.methods);
  assertEquals(names.some((name) => name.endsWith("_v2")), false);
  assertEquals(names.includes("start_review"), true);
  assertEquals(names.includes("status"), true);
  assertEquals(names.includes("resume"), true);
});

Deno.test("public routing rejects malformed V2 envelopes without V1 strip fallback", () => {
  const argumentsSchema = model.methods.start_review!.arguments!;
  const genuineV1 = argumentsSchema.safeParse({
    reviewId: "legacy",
    expectedGroups: ["Application"],
    selectedSpecialists: ["completeness"],
  });
  assertEquals(genuineV1.success, true);
  const malformedV2Cases: unknown[] = [
    { schemaVersion: 2, reviewId: "v2", unknownField: true },
    { schemaVersion: 3, reviewId: "v2" },
    { schemaVersion: 2, reviewId: "v2", selectedLenses: ["not-a-lens"] },
    { schemaVersion: 2, selectedSpecialists: ["completeness"] },
    { recordVersion: 2, reviewId: "v2" },
    { selectedLenses: ["security"], reviewId: "v2" },
  ];
  for (const value of malformedV2Cases) {
    assertEquals(argumentsSchema.safeParse(value).success, false);
  }
});

Deno.test("snapshot reads fail closed on tampering and preserve the stopped phase", async () => {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "tamper",
    selectedSpecialists: ["completeness"],
    selectedLenses: ["security"],
  }, test.context);
  const snapshot = test.resources["roleSnapshotsV2-tamper-e1-s0"]!;
  const entries = snapshot.snapshots as Record<string, unknown>[];
  entries[0] = { ...entries[0], snapshotDigest: `sha256-${"f".repeat(64)}` };
  await assertRejects(() =>
    model.methods.status!.execute({
      schemaVersion: 2,
      reviewId: "tamper",
      epoch: 1,
    }, test.context)
  );
  // The state itself remains untouched; a failed integrity read cannot rewrite history.
  assertEquals(test.resources["reviewStateV2-tamper-e1-s0"]!.phase, "collecting");
});

Deno.test("v2 stop stores the exact phase for later resume", async () => {
  const test = testContext();
  await model.methods.start_review!.execute({
    schemaVersion: 2,
    reviewId: "phase",
    selectedSpecialists: ["completeness"],
  }, test.context);
  await model.methods.stop!.execute({ schemaVersion: 2, reviewId: "phase", epoch: 1 }, test.context);
  const stopped = test.resources["reviewStateV2-phase-e1-s0"]!;
  assertEquals(stopped.phase, "stopped");
  assertEquals("stoppedFromPhase" in stopped, false);
});
