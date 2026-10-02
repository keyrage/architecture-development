import { z } from "npm:zod@4";
import { EvidenceChunkSchema, EvidenceManifestSchema } from "./schemas.ts";

const StringMapSchema = z.record(z.string(), z.string());
const ModelSchema = z.object({
  canonicalId: z.string().min(1),
  name: z.string(),
  purpose: z.string(),
  properties: StringMapSchema,
}).strict();
const LimitsSchema = z.object({
  maxPageSize: z.literal(200),
  maxTraversalDepth: z.literal(5),
  maxTraversalVisits: z.literal(10000),
  maxTraversalResults: z.literal(5000),
  maxHistoryResults: z.literal(1000),
  maxResponseBytes: z.literal(4194304),
}).strict();
const DiscoverySchema = z.object({
  apiVersion: z.literal("v1"),
  capabilities: z.array(z.string()).min(1),
  limits: LimitsSchema,
  model: ModelSchema,
  graphContractVersion: z.literal(2),
  publishedRevision: z.number().int().positive(),
}).strict();
const ItemBaseSchema = z.object({
  canonicalId: z.string().min(1),
  type: z.string(),
  name: z.string(),
  documentation: z.string(),
  properties: StringMapSchema,
}).passthrough();
const FolderSchema = ItemBaseSchema.extend({ parentId: z.string().nullable() });
const ElementSchema = ItemBaseSchema.extend({
  folderId: z.string().nullable(),
});
const RelationshipSchema = ItemBaseSchema.extend({
  folderId: z.string().nullable(),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  accessType: z.number().int().nullable(),
  influenceStrength: z.string().nullable(),
  isDirected: z.boolean().nullable(),
});
const PageEnvelopeSchema = z.object({
  apiVersion: z.literal("v1"),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  nextCursor: z.string().nullable(),
}).passthrough();

type Item = Record<string, unknown> & { canonicalId: string };
export type CollectionKind = "folders" | "elements" | "relationships";
export interface Discovery {
  apiVersion: "v1";
  capabilities: string[];
  limits: z.infer<typeof LimitsSchema>;
  model: z.infer<typeof ModelSchema>;
  graphContractVersion: 2;
  publishedRevision: number;
}
export interface CollectionResult {
  discovery: Discovery;
  pages: Record<CollectionKind, Item[][]>;
  counts: Record<CollectionKind, number>;
  restarted: boolean;
}
export interface QueryClientOptions {
  endpointFile: string;
  modelId: string;
  bearerToken: string;
  fetcher?: typeof fetch;
  pageSize?: number;
}

/** Stable, non-secret error for the public model boundary. */
export class QueryBoundaryError extends Error {
  readonly code:
    | "missing_endpoint"
    | "authorization_denied"
    | "incompatible_contract"
    | "revision_moved"
    | "malformed_response"
    | "pagination_invalid"
    | "dangling_relationship"
    | "duplicate_id";
  constructor(code: QueryBoundaryError["code"], message: string) {
    super(message);
    this.name = "QueryBoundaryError";
    this.code = code;
  }
}

/** Read the ephemeral endpoint file and normalize the URL without persisting it. */
export async function readEndpoint(endpointFile: string): Promise<string> {
  try {
    const value = (await Deno.readTextFile(endpointFile)).trim();
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported endpoint");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new QueryBoundaryError(
      "missing_endpoint",
      "configured Archi query endpoint is unavailable",
    );
  }
}

async function requestJson(
  client: Required<QueryClientOptions>,
  url: string,
): Promise<unknown> {
  const response = await client.fetcher(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${client.bearerToken}`,
      Accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new QueryBoundaryError(
      "authorization_denied",
      "configured model identity is missing, revoked, or incompatible",
    );
  }
  if (response.status === 409) {
    throw new QueryBoundaryError(
      "revision_moved",
      "published revision moved during collection",
    );
  }
  if (!response.ok) {
    throw new QueryBoundaryError(
      "malformed_response",
      `Archi query request failed with HTTP ${response.status}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new QueryBoundaryError(
      "malformed_response",
      "Archi query returned invalid JSON",
    );
  }
}

function checkEnvelope(
  value: unknown,
  modelId: string,
  revision: number,
): Record<string, unknown> {
  const envelope = PageEnvelopeSchema.parse(value);
  if (envelope.modelId !== modelId || envelope.publishedRevision !== revision) {
    throw new QueryBoundaryError(
      "revision_moved",
      "model identity or published revision changed during collection",
    );
  }
  return envelope;
}

function contractUrl(
  endpoint: string,
  suffix: string,
  query: URLSearchParams,
): string {
  const root = endpoint.endsWith("/agent-query/v1") ? endpoint : `${endpoint}/agent-query/v1`;
  return `${root}${suffix}?${query}`;
}

/** Discover and enforce the exact v1 graph boundary and advertised hard limits. */
export async function discover(
  options: QueryClientOptions,
): Promise<Discovery> {
  const endpoint = await readEndpoint(options.endpointFile);
  const client = {
    ...options,
    endpointFile: options.endpointFile,
    fetcher: options.fetcher ?? fetch,
  } as Required<QueryClientOptions>;
  const value = await requestJson(
    client,
    contractUrl(
      endpoint,
      "",
      new URLSearchParams({ modelId: options.modelId }),
    ),
  );
  const discovery = DiscoverySchema.safeParse(value);
  if (
    !discovery.success || discovery.data.model.canonicalId !== options.modelId
  ) {
    throw new QueryBoundaryError(
      "incompatible_contract",
      "Archi query discovery is not the supported v1 graph contract",
    );
  }
  return discovery.data;
}

function parsePage(
  kind: CollectionKind,
  value: unknown,
  modelId: string,
  revision: number,
): { items: Item[]; nextCursor: string | null } {
  const envelope = checkEnvelope(value, modelId, revision);
  const raw = envelope.items;
  if (!Array.isArray(raw) || raw.length > 200) {
    throw new QueryBoundaryError(
      "malformed_response",
      "Archi query page exceeds its advertised bound",
    );
  }
  const schema = kind === "folders" ? FolderSchema : kind === "elements" ? ElementSchema : RelationshipSchema;
  const items = raw.map((item) => schema.parse(item) as Item);
  return {
    items,
    nextCursor: typeof envelope.nextCursor === "string" ? envelope.nextCursor : null,
  };
}

async function collectKind(
  client: Required<QueryClientOptions>,
  endpoint: string,
  kind: CollectionKind,
  modelId: string,
  revision: number,
  writePage: (
    kind: CollectionKind,
    index: number,
    items: Item[],
  ) => Promise<void>,
): Promise<Item[][]> {
  const pages: Item[][] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let index = 0;; index++) {
    const query = new URLSearchParams({
      modelId,
      pageSize: String(client.pageSize),
    });
    if (cursor) query.set("cursor", cursor);
    const value = await requestJson(
      client,
      contractUrl(endpoint, `/${kind}`, query),
    );
    const page = parsePage(kind, value, modelId, revision);
    if (cursor && cursors.has(cursor)) {
      throw new QueryBoundaryError(
        "pagination_invalid",
        "opaque cursor repeated during collection",
      );
    }
    if (cursor) cursors.add(cursor);
    for (const item of page.items) {
      if (ids.has(item.canonicalId)) {
        throw new QueryBoundaryError(
          "duplicate_id",
          `duplicate ${kind} canonical ID in active collection`,
        );
      }
      ids.add(item.canonicalId);
    }
    pages.push(page.items);
    await writePage(kind, index, page.items);
    if (page.nextCursor === null) return pages;
    cursor = page.nextCursor;
  }
}

/** Collect every active semantic object into a temporary staging tree before durable writes. */
export async function collectComplete(
  options: QueryClientOptions,
  stagingRoot: string,
): Promise<CollectionResult> {
  const discoveryData = await discover(options);
  const endpoint = await readEndpoint(options.endpointFile);
  const client = {
    ...options,
    fetcher: options.fetcher ?? fetch,
    pageSize: Math.min(options.pageSize ?? 200, 200),
  } as Required<QueryClientOptions>;
  const pages: Record<CollectionKind, Item[][]> = {
    folders: [],
    elements: [],
    relationships: [],
  };
  await Deno.mkdir(stagingRoot, { recursive: true });
  const writePage = async (
    kind: CollectionKind,
    index: number,
    items: Item[],
  ) => {
    await Deno.writeTextFile(
      `${stagingRoot}/${kind}-${index}.json`,
      JSON.stringify(items),
    );
  };
  for (const kind of ["folders", "elements", "relationships"] as const) {
    pages[kind] = await collectKind(
      client,
      endpoint,
      kind,
      options.modelId,
      discoveryData.publishedRevision,
      writePage,
    );
  }
  const folders = new Set(pages.folders.flat().map((item) => item.canonicalId));
  const elements = new Set(
    pages.elements.flat().map((item) => item.canonicalId),
  );
  for (const relationship of pages.relationships.flat()) {
    if (
      !elements.has(String(relationship.sourceId)) ||
      !elements.has(String(relationship.targetId))
    ) {
      throw new QueryBoundaryError(
        "dangling_relationship",
        "active relationship endpoint is missing from the complete element collection",
      );
    }
  }
  void folders;
  return {
    discovery: discoveryData,
    pages,
    counts: {
      folders: pages.folders.flat().length,
      elements: pages.elements.flat().length,
      relationships: pages.relationships.flat().length,
    },
    restarted: false,
  };
}

/** Hash a staged chunk for durable integrity and schema validation. */
export async function evidenceChunk(
  reviewId: string,
  epoch: number,
  sequence: number,
  modelId: string,
  revision: number,
  kind: CollectionKind,
  items: Item[],
): Promise<z.infer<typeof EvidenceChunkSchema>> {
  const bytes = new TextEncoder().encode(JSON.stringify(items));
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return EvidenceChunkSchema.parse({
    reviewId,
    epoch,
    sequence,
    modelId,
    publishedRevision: revision,
    kind,
    items,
    itemCount: items.length,
    digest,
  });
}

/** Build the final manifest only after all pages and referential checks pass. */
export function evidenceManifest(
  reviewId: string,
  epoch: number,
  result: CollectionResult,
): z.infer<typeof EvidenceManifestSchema> {
  return EvidenceManifestSchema.parse({
    reviewId,
    epoch,
    modelId: result.discovery.model.canonicalId,
    publishedRevision: result.discovery.publishedRevision,
    complete: true,
    chunkCount: Object.values(result.pages).flat().length,
    counts: result.counts,
    collectedAt: new Date().toISOString(),
    restarted: result.restarted,
  });
}
