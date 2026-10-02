import { assertEquals, assertRejects } from "../_test/assert.ts";
import { collectComplete, discover, QueryBoundaryError } from "./agent_query.ts";

const item = (id: string) => ({
  canonicalId: id,
  type: "ApplicationComponent",
  folderId: null,
  name: id,
  documentation: "",
  properties: {},
});
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function discovery(revision = 7) {
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

Deno.test("query adapter follows opaque cursors for every active collection", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "review-endpoint-" });
  const stagingRoot = await Deno.makeTempDir({ prefix: "review-staging-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  const calls: string[] = [];
  const fetcher = (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const path = String(url);
    calls.push(path);
    if (
      path.includes("/agent-query/v1?") && !path.includes("/folders") && !path.includes("/elements") &&
      !path.includes("/relationships")
    ) return Promise.resolve(response(discovery()));
    const parsed = new URL(path);
    const kind = parsed.pathname.split("/").at(-1);
    if (!parsed.searchParams.has("cursor")) {
      return Promise.resolve(response({
        apiVersion: "v1",
        modelId: "model-1",
        publishedRevision: 7,
        items: kind === "elements" ? [item("e1")] : [],
        nextCursor: kind === "elements" ? "opaque-1" : null,
      }));
    }
    return Promise.resolve(response({
      apiVersion: "v1",
      modelId: "model-1",
      publishedRevision: 7,
      items: [item("e2")],
      nextCursor: null,
    }));
  };
  try {
    const result = await collectComplete(
      { endpointFile, modelId: "model-1", bearerToken: "runtime-only", fetcher },
      stagingRoot,
    );
    assertEquals(result.counts.elements, 2);
    assertEquals(calls.some((call) => call.includes("cursor=opaque-1")), true);
  } finally {
    await Deno.remove(endpointFile);
    await Deno.remove(stagingRoot, { recursive: true });
  }
});

Deno.test("query adapter fails closed on revision movement", async () => {
  const endpointFile = await Deno.makeTempFile({ prefix: "review-endpoint-" });
  await Deno.writeTextFile(endpointFile, "http://127.0.0.1:9999");
  try {
    await assertRejects(
      () =>
        discover({
          endpointFile,
          modelId: "model-1",
          bearerToken: "runtime-only",
          fetcher: (_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(response({}, 409)),
        }),
      QueryBoundaryError,
      "revision moved",
    );
  } finally {
    await Deno.remove(endpointFile);
  }
});
