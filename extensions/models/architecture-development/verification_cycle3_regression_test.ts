import { assertEquals, assertRejects } from "./_test/assert.ts";
import { canonicalRecommendationIds, classifyLens, LENS_ORDER } from "./_lib/lenses.ts";
import { model } from "./architecture_review.ts";

Deno.test("cycle-3 regression: malformed required evidence is unavailable", () => {
  for (const lens of LENS_ORDER) {
    const signalKey = lens === "qualityAttribute" ? "qualitySignals" : `${lens}Signals`;
    for (const value of [null, "wrong-type", { malformed: true }]) {
      assertEquals(
        classifyLens(lens, { elements: value }).applicability,
        "insufficient-evidence",
      );
      assertEquals(
        classifyLens(lens, { elements: [], [signalKey]: value }).applicability,
        "insufficient-evidence",
      );
    }
  }
});

Deno.test("cycle-3 regression: recommendation IDs are sequential and input-order independent", () => {
  const fingerprints = ["zeta", "alpha", "middle"];
  const forward = canonicalRecommendationIds(fingerprints);
  const reversed = canonicalRecommendationIds([...fingerprints].reverse());
  assertEquals(forward.get("alpha"), "r2-00000001");
  assertEquals(forward.get("middle"), "r2-00000002");
  assertEquals(forward.get("zeta"), "r2-00000003");
  assertEquals([...forward.entries()], [...reversed.entries()]);
  assertRejects(() => Promise.resolve(canonicalRecommendationIds(["same", "same"])));
});

Deno.test("cycle-3 regression: public V2 signals never fall through V1 parsing", () => {
  const schema = model.methods.start_review!.arguments!;
  assertEquals(schema.safeParse({ reviewId: "legacy" }).success, true);
  for (
    const input of [
      { schemaVersion: 2, reviewId: "bad", unknown: true },
      { schemaVersion: 99, reviewId: "bad" },
      { recordVersion: 2, reviewId: "bad" },
      { selectedLenses: ["security"], reviewId: "bad" },
      { schemaVersion: 2, reviewId: "bad", selectedLenses: ["unknown"] },
    ]
  ) {
    assertEquals(schema.safeParse(input).success, false);
  }
});
