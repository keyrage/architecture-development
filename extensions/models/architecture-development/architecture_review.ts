import { z } from "npm:zod@4";
import { discover } from "./_lib/agent_query.ts";
import { collectEvidence } from "./_lib/evidence_collection.ts";
import {
  DispositionSchema,
  EvidenceChunkSchema,
  EvidenceChunkV2Schema,
  EvidenceManifestSchema,
  EvidenceManifestV2Schema,
  ExpectedGroupsSchema,
  FollowupSchema,
  type GlobalArgs,
  GlobalArgsSchema,
  ReviewIdentitySchema,
  type ReviewState,
  ReviewStateSchema,
  SpecialistAssessmentSchema,
  SpecialistIdSchema,
  StartArgumentsSchema,
  SynthesisSchema,
} from "./_lib/schemas.ts";
import {
  assertSameEpoch,
  assertSynthesisCoverage,
  canonicalSelection,
  instanceName,
  normalizeAssessments,
} from "./_lib/review_state.ts";
import { rankRecommendations } from "./_lib/ranking.ts";
import {
  AssessmentRecordV2Schema,
  canonicalRoles,
  classifyLens,
  deriveLensEvidence,
  DispositionV2Schema,
  FollowupV2Schema,
  lensDeclaration,
  LensIdSchema,
  qualifiedFindingKey,
  ReviewStateV2Schema,
  RoleAssessmentV2Schema,
  RoleSnapshotRecordSchema,
  roleSnapshotResourceName,
  roleSnapshots,
  SynthesisV2Schema,
  validateV2Synthesis,
} from "./_lib/lenses.ts";

interface Logger {
  info(message: string, properties: Record<string, unknown>): void;
  warning(message: string, properties: Record<string, unknown>): void;
}
/**
 * Host execution merges global arguments into method arguments before schema
 * validation. Method inputs therefore strip only those unknown merged keys;
 * durable resource schemas remain strict and unchanged.
 */
const methodInput = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strip();
const HOST_GLOBAL_KEYS = new Set([
  "modelId",
  "endpointFile",
  "bearerToken",
  "repositoryRoot",
]);
const strictMethodInput = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !HOST_GLOBAL_KEYS.has(key)),
    );
  }, z.object(shape).strict());
const startMethodInput = StartArgumentsSchema.strip();
const identityMethodInput = ReviewIdentitySchema.strip();

const assessmentMethodInput = methodInput({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  assessments: z.array(SpecialistAssessmentSchema),
});
const synthesisMethodInput = methodInput({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  synthesis: SynthesisSchema,
});
const followupMethodInput = methodInput({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().positive(),
  recommendationId: z.string().min(1),
  specialist: z.string(),
  question: z.string().min(1),
  response: z.string().min(1),
});
const dispositionMethodInput = methodInput({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  recommendationId: z.string().min(1),
  disposition: z.enum([
    "accepted",
    "rejected",
    "deferred",
    "needs-investigation",
    "undecided",
  ]),
  rationale: z.string().min(1).max(1000),
});
const v2StartInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/),
  expectedGroups: ExpectedGroupsSchema.optional(),
  selectedSpecialists: z.array(z.string()).optional(),
  selectedLenses: z.array(LensIdSchema).optional(),
  epoch: z.number().int().positive().optional(),
});
const v2IdentityInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
});
const v2AssessmentInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  assessments: z.array(RoleAssessmentV2Schema),
});
const v2SynthesisInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  synthesis: SynthesisV2Schema,
});
const v2FollowupInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().positive(),
  recommendationId: z.string().regex(/^r2-[0-9]{8}$/),
  roleKind: z.enum(["specialist", "lens"]),
  roleId: z.string().min(1),
  question: z.string().min(1),
  response: z.string().min(1),
});
const v2DispositionInput = strictMethodInput({
  schemaVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  recommendationId: z.string().regex(/^r2-[0-9]{8}$/),
  roleKind: z.enum(["specialist", "lens"]),
  roleId: z.string().min(1),
  disposition: z.enum([
    "accepted",
    "rejected",
    "deferred",
    "needs-investigation",
    "undecided",
  ]),
  rationale: z.string().min(1).max(1000),
});
function v2Name(
  spec: string,
  reviewId: string,
  epoch: number,
  sequence: number | string = 0,
): string {
  return instanceName(`${spec}V2`, reviewId, epoch, sequence);
}
async function readV2State(context: Context, reviewId: string, epoch: number) {
  const value = await context.readResource?.(
    v2Name("reviewState", reviewId, epoch),
  );
  if (!value) {
    throw new Error("v2 review epoch was not found; start a v2 review first");
  }
  const state = ReviewStateV2Schema.parse(value);
  assertPersistedIdentity(state, reviewId, epoch, context.globalArgs.modelId);
  if (
    (["assessing", "synthesizing", "dialogue"].includes(state.phase) && state.publishedRevision === undefined) ||
    (state.phase === "collecting" && state.publishedRevision !== undefined)
  ) throw new Error("v2 state phase is inconsistent with its published revision");
  return state;
}
function assertPersistedIdentity(
  record: { reviewId: string; epoch: number; modelId: string; publishedRevision?: number },
  reviewId: string,
  epoch: number,
  modelId: string,
  publishedRevision?: number,
): void {
  if (
    record.reviewId !== reviewId || record.epoch !== epoch ||
    record.modelId !== modelId ||
    (publishedRevision !== undefined && record.publishedRevision !== publishedRevision)
  ) {
    throw new Error("persisted resource identity does not match the active review epoch");
  }
}
async function readV2Snapshots(
  context: Context,
  state: z.infer<typeof ReviewStateV2Schema>,
) {
  const expectedName = roleSnapshotResourceName(state.reviewId, state.epoch);
  if (state.roleSnapshotResourceName !== expectedName) {
    throw new Error("v2 role snapshot resource name is invalid");
  }
  const value = await context.readResource?.(expectedName);
  if (!value) throw new Error("v2 role snapshots are missing");
  const record = RoleSnapshotRecordSchema.parse(value);
  if (record.reviewId !== state.reviewId || record.epoch !== state.epoch) {
    throw new Error("v2 role snapshot identity does not match state");
  }
  const expected = await roleSnapshots(
    state.selectedSpecialists,
    state.selectedLenses,
  );
  if (record.snapshots.length !== expected.length) {
    throw new Error("v2 role snapshot inventory is incomplete");
  }
  for (let index = 0; index < expected.length; index++) {
    const actual = record.snapshots[index]!;
    const wanted = expected[index]!;
    if (
      actual.roleKind !== wanted.roleKind || actual.roleId !== wanted.roleId ||
      actual.definitionVersion !== wanted.definitionVersion ||
      actual.evaluatorVersion !== wanted.evaluatorVersion ||
      actual.snapshotDigest !== wanted.snapshotDigest ||
      JSON.stringify(actual.definitionSnapshot) !==
        JSON.stringify(wanted.definitionSnapshot)
    ) {
      throw new Error(
        "v2 role snapshot is tampered, reordered, or evaluator-drifted",
      );
    }
  }
  return record.snapshots;
}
function qualifiedKeyRoleMatches(
  key: string,
  roleKind: "specialist" | "lens",
  roleId: string,
): boolean {
  const parts = key.split(":");
  if (parts.length !== 4 || parts[0] !== "qf2") return false;
  try {
    const encodedKind = parts[1];
    const encodedRole = parts[2];
    return encodedKind !== undefined && encodedRole !== undefined &&
      decodeURIComponent(encodedKind) === roleKind &&
      decodeURIComponent(encodedRole) === roleId;
  } catch {
    return false;
  }
}
async function readV2Evidence(
  context: Context,
  state: z.infer<typeof ReviewStateV2Schema>,
): Promise<Record<string, unknown>> {
  if (state.publishedRevision === undefined) {
    throw new Error("v2 evidence requires a published revision");
  }
  const manifestValue = await context.readResource?.(
    v2Name("evidenceManifest", state.reviewId, state.epoch),
  );
  if (!manifestValue) throw new Error("v2 evidence manifest is missing");
  const manifest = EvidenceManifestV2Schema.parse(manifestValue);
  if (
    manifest.reviewId !== state.reviewId || manifest.epoch !== state.epoch ||
    manifest.modelId !== state.modelId ||
    manifest.publishedRevision !== state.publishedRevision
  ) {
    throw new Error("v2 evidence manifest identity does not match state");
  }
  const evidence: Record<string, unknown> = {
    folders: [],
    elements: [],
    relationships: [],
  };
  const counts = { folders: 0, elements: 0, relationships: 0 };
  const kindOrder = { folders: 0, elements: 1, relationships: 2 } as const;
  const seenKinds = new Set<keyof typeof kindOrder>();
  let priorKind = -1;
  for (let sequence = 0; sequence < manifest.chunkCount; sequence++) {
    const value = await context.readResource?.(
      v2Name("evidenceChunk", state.reviewId, state.epoch, sequence),
    );
    if (!value) throw new Error("v2 evidence chunk is missing");
    const chunk = EvidenceChunkV2Schema.parse(value);
    if (
      chunk.reviewId !== state.reviewId || chunk.epoch !== state.epoch ||
      chunk.sequence !== sequence || chunk.modelId !== state.modelId ||
      chunk.publishedRevision !== state.publishedRevision
    ) {
      throw new Error("v2 evidence chunk identity or sequence does not match state");
    }
    if (kindOrder[chunk.kind] < priorKind) {
      throw new Error("v2 evidence chunk kinds are out of collection order");
    }
    priorKind = kindOrder[chunk.kind];
    seenKinds.add(chunk.kind);
    if (chunk.itemCount !== chunk.items.length) {
      throw new Error("v2 evidence chunk item count is invalid");
    }
    const digestBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(chunk.items)),
    );
    const canonicalDigest = Array.from(
      new Uint8Array(digestBytes),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (chunk.digest !== canonicalDigest) {
      throw new Error("v2 evidence chunk digest is invalid");
    }
    counts[chunk.kind] += chunk.itemCount;
    (evidence[chunk.kind] as unknown[]).push(...chunk.items);
  }
  if (seenKinds.size !== 3) {
    throw new Error("v2 evidence is missing a collection kind");
  }
  if (
    counts.folders !== manifest.counts.folders ||
    counts.elements !== manifest.counts.elements ||
    counts.relationships !== manifest.counts.relationships
  ) {
    throw new Error("v2 evidence manifest counts do not match chunks");
  }
  const extra = await context.readResource?.(
    v2Name("evidenceChunk", state.reviewId, state.epoch, manifest.chunkCount),
  );
  if (extra) throw new Error("v2 evidence contains an extra contiguous chunk");
  return deriveLensEvidence(evidence);
}

/** Revalidate the same role contract on input and every persisted assessment consumption. */
async function validateV2Assessments(
  context: Context,
  state: z.infer<typeof ReviewStateV2Schema>,
  assessments: z.infer<typeof RoleAssessmentV2Schema>[],
): Promise<void> {
  if (state.publishedRevision === undefined) throw new Error("v2 assessments require a published revision");
  const selected = [
    ...state.selectedSpecialists.map((role) => `specialist:${role}`),
    ...state.selectedLenses.map((role) => `lens:${role}`),
  ];
  if (
    assessments.length !== selected.length ||
    assessments.some((assessment, index) => `${assessment.roleKind}:${assessment.roleId}` !== selected[index])
  ) throw new Error("v2 assessments must contain exactly one selected role in canonical order");
  const snapshots = await readV2Snapshots(context, state);
  const evidence = await readV2Evidence(context, state);
  const selectedSet = new Set(selected);
  const seen = new Set<string>();
  const findingKeys = new Set<string>();
  for (let index = 0; index < assessments.length; index++) {
    const assessment = assessments[index]!;
    const parsed = RoleAssessmentV2Schema.parse(assessment);
    const key = `${parsed.roleKind}:${parsed.roleId}`;
    if (
      !selectedSet.has(key) || seen.has(key) || key !== selected[index]
    ) {
      throw new Error(
        "v2 assessments must contain exactly one selected role in canonical order",
      );
    }
    if (
      parsed.modelId !== state.modelId ||
      parsed.publishedRevision !== state.publishedRevision
    ) {
      throw new Error("v2 assessment identity does not match state");
    }
    const snapshot = snapshots.find((candidate) =>
      candidate.roleKind === parsed.roleKind &&
      candidate.roleId === parsed.roleId
    );
    if (
      !snapshot ||
      parsed.definitionVersion !== snapshot.definitionVersion ||
      parsed.evaluatorVersion !== snapshot.evaluatorVersion ||
      parsed.snapshotDigest !== snapshot.snapshotDigest
    ) {
      throw new Error(
        "v2 assessment evaluator or snapshot does not match persisted role snapshot",
      );
    }
    if (parsed.roleKind === "specialist" && snapshot.definitionSnapshot.kind === "specialist") {
      const definition = snapshot.definitionSnapshot;
      if (
        JSON.stringify(parsed.checkedEvidenceKeys) !== JSON.stringify(definition.requiredEvidenceKeys) ||
        JSON.stringify(parsed.evaluatedEvidenceKeys) !== JSON.stringify(definition.requiredEvidenceKeys) ||
        JSON.stringify(parsed.limitations) !== JSON.stringify(definition.limitations)
      ) throw new Error("v2 specialist evidence reporting must match its persisted snapshot");
    }
    for (const finding of parsed.findings) {
      if (findingKeys.has(finding.findingKey)) throw new Error("duplicate V2 finding key");
      findingKeys.add(finding.findingKey);
      if (
        finding.roleKind !== parsed.roleKind ||
        finding.roleId !== parsed.roleId ||
        finding.findingKey !==
          qualifiedFindingKey(
            parsed.roleKind,
            parsed.roleId,
            finding.localFindingId,
          )
      ) {
        throw new Error(
          "v2 finding must be owned by its selected parent role",
        );
      }
    }
    if (parsed.roleKind === "lens") {
      const declaration = lensDeclaration(parsed.roleId);
      const applicability = classifyLens(parsed.roleId, evidence);
      if (
        parsed.applicability !== applicability.applicability ||
        JSON.stringify(parsed.checkedEvidenceKeys) !==
          JSON.stringify(applicability.checkedEvidenceKeys) ||
        JSON.stringify(parsed.missingEvidenceKeys) !==
          JSON.stringify(applicability.missingEvidenceKeys) ||
        JSON.stringify(parsed.evaluatedEvidenceKeys) !==
          JSON.stringify(applicability.evaluatedEvidenceKeys)
      ) {
        throw new Error(
          "v2 lens applicability does not match persisted evidence",
        );
      }
      if (
        parsed.applicabilityRationale !== applicability.rationale ||
        JSON.stringify(parsed.limitations) !== JSON.stringify(declaration.limitations)
      ) {
        throw new Error("v2 lens rationale or limitations do not match the persisted evaluator");
      }
      if (!applicability.concernMatched && parsed.findings.length > 0) {
        throw new Error("a lens without a matched concern must contain exactly zero findings");
      }
      if (applicability.concernMatched && parsed.findings.length === 0) {
        throw new Error("a matched lens concern must produce findings");
      }
      const signalIds = new Set(
        (evidence[declaration.concernEvidenceKeys[0]!] as Record<string, unknown>[] ?? [])
          .map((item) => item.canonicalId)
          .filter((id): id is string => typeof id === "string"),
      );
      const coveredSignalIds = new Set<string>();
      for (const finding of parsed.findings) {
        if (
          finding.epistemicKind !== declaration.epistemicKind ||
          finding.citations.length === 0 ||
          !finding.basis?.length || !finding.limitations?.length
        ) {
          throw new Error(
            "lens findings must match authoritative heuristic epistemic requirements",
          );
        }
        const referencedSignalIds = finding.canonicalIds.filter((id) => signalIds.has(id));
        if (
          referencedSignalIds.length === 0 ||
          !finding.citations.some((citation) => signalIds.has(citation.canonicalId))
        ) {
          throw new Error("lens findings must cite their persisted concern evidence");
        }
        referencedSignalIds.forEach((id) => coveredSignalIds.add(id));
      }
      if (
        applicability.concernMatched &&
        [...signalIds].some((id) => !coveredSignalIds.has(id))
      ) {
        throw new Error("lens findings must cover every persisted concern signal");
      }
    }
    seen.add(key);
  }
  if (seen.size !== selectedSet.size) {
    throw new Error("v2 assessments must contain every selected role");
  }
}

async function readV2Assessments(context: Context, state: z.infer<typeof ReviewStateV2Schema>) {
  const value = await context.readResource?.(v2Name("specialistAssessments", state.reviewId, state.epoch));
  if (!value) throw new Error("v2 assessments are required before synthesis");
  const record = AssessmentRecordV2Schema.parse(value);
  assertPersistedIdentity(record, state.reviewId, state.epoch, state.modelId, state.publishedRevision);
  await validateV2Assessments(context, state, record.assessments);
  return record;
}

async function validatePersistedV2Synthesis(
  context: Context,
  state: z.infer<typeof ReviewStateV2Schema>,
  value: unknown,
) {
  const synthesis = SynthesisV2Schema.parse(value);
  assertPersistedIdentity(synthesis, state.reviewId, state.epoch, state.modelId, state.publishedRevision);
  const assessments = await readV2Assessments(context, state);
  const canonical = validateV2Synthesis(assessments.assessments, synthesis);
  if (JSON.stringify(canonical.recommendations) !== JSON.stringify(synthesis.recommendations)) {
    throw new Error("persisted v2 recommendations must retain canonical ranking and scoring");
  }
  return canonical;
}

async function inferStoppedV2Phase(
  context: Context,
  state: z.infer<typeof ReviewStateV2Schema>,
): Promise<"collecting" | "assessing" | "synthesizing" | "dialogue"> {
  if (state.publishedRevision === undefined) {
    for (const spec of ["evidenceManifest", "specialistAssessments", "synthesis"]) {
      if (await context.readResource?.(v2Name(spec, state.reviewId, state.epoch))) {
        throw new Error("v2 collecting phase cannot contain completed downstream records");
      }
    }
    return "collecting";
  }
  await readV2Evidence(context, state);
  const assessmentValue = await context.readResource?.(
    v2Name("specialistAssessments", state.reviewId, state.epoch),
  );
  if (!assessmentValue) {
    if (await context.readResource?.(v2Name("synthesis", state.reviewId, state.epoch))) {
      throw new Error("v2 synthesis without assessments cannot determine a stopped phase");
    }
    return "assessing";
  }
  const assessments = await readV2Assessments(context, state);
  if (
    assessments.reviewId !== state.reviewId || assessments.epoch !== state.epoch ||
    assessments.modelId !== state.modelId ||
    assessments.publishedRevision !== state.publishedRevision
  ) throw new Error("v2 assessment identity does not match stopped state");
  const synthesisValue = await context.readResource?.(
    v2Name("synthesis", state.reviewId, state.epoch),
  );
  if (!synthesisValue) return "synthesizing";
  const synthesis = await validatePersistedV2Synthesis(context, state, synthesisValue);
  if (
    synthesis.reviewId !== state.reviewId || synthesis.epoch !== state.epoch ||
    synthesis.modelId !== state.modelId ||
    synthesis.publishedRevision !== state.publishedRevision
  ) throw new Error("v2 synthesis identity does not match stopped state");
  return "dialogue";
}
function selectedRole(
  state: z.infer<typeof ReviewStateV2Schema>,
  roleKind: "specialist" | "lens",
  roleId: string,
): boolean {
  return roleKind === "specialist"
    ? state.selectedSpecialists.includes(
      roleId as z.infer<typeof SpecialistIdSchema>,
    )
    : state.selectedLenses.includes(roleId as z.infer<typeof LensIdSchema>);
}

interface Context {
  globalArgs: GlobalArgs;
  methodName?: string;
  /** Optional host-provided fetch implementation for hermetic contract execution. */
  fetcher?: typeof fetch;
  logger: Logger;
  writeResource(
    specName: string,
    instanceName: string,
    data: Record<string, unknown>,
  ): Promise<{ name: string }>;
  readResource?(
    instanceName: string,
    version?: number,
  ): Promise<Record<string, unknown> | null>;
}
async function readState(
  context: Context,
  reviewId: string,
  epoch: number,
): Promise<ReviewState> {
  const value = await context.readResource?.(
    instanceName("reviewState", reviewId, epoch),
  );
  if (!value) {
    throw new Error("review epoch was not found; start a review first");
  }
  const state = ReviewStateSchema.parse(value);
  assertPersistedIdentity(state, reviewId, epoch, context.globalArgs.modelId);
  return state;
}
async function requireV1Recommendation(
  context: Context,
  state: ReviewState,
  reviewId: string,
  epoch: number,
  recommendationId: string,
): Promise<void> {
  if (state.reviewId !== reviewId || state.epoch !== epoch) {
    throw new Error("review state identity does not match the requested epoch");
  }
  const value = await context.readResource?.(
    instanceName("synthesis", reviewId, epoch),
  );
  if (!value) {
    throw new Error("persisted synthesis is required for V1 dialogue");
  }
  const synthesis = SynthesisSchema.parse(value);
  if (
    synthesis.reviewId !== reviewId || synthesis.epoch !== epoch ||
    synthesis.modelId !== state.modelId ||
    synthesis.publishedRevision !== state.publishedRevision
  ) {
    throw new Error("persisted synthesis identity does not match the reviewed revision");
  }
  if (
    !synthesis.recommendations.some((recommendation) => recommendation.recommendationId === recommendationId)
  ) {
    throw new Error("recommendation was not found in persisted V1 synthesis");
  }
}
function now(): string {
  return new Date().toISOString();
}
function writeState(
  context: Context,
  state: ReviewState,
): Promise<{ name: string }> {
  return context.writeResource(
    "reviewState",
    instanceName("reviewState", state.reviewId, state.epoch),
    state,
  );
}
const AssessmentRecordSchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  assessments: z.array(SpecialistAssessmentSchema),
  recordedAt: z.string().datetime(),
}).strict();

function withMethodLogging(
  methodName: string,
  execute: (
    args: unknown,
    context: Context,
  ) => Promise<Record<string, unknown>>,
): (args: unknown, context: Context) => Promise<Record<string, unknown>> {
  return async (
    args: unknown,
    context: Context,
  ): Promise<Record<string, unknown>> => {
    const identity = args && typeof args === "object"
      ? {
        reviewId: (args as Record<string, unknown>).reviewId,
        epoch: (args as Record<string, unknown>).epoch,
      }
      : {};
    context.logger.info("architecture review method {method} started", {
      method: methodName,
      ...identity,
    });
    try {
      const result = await execute(args, context);
      context.logger.info("architecture review method {method} completed", {
        method: methodName,
        ...identity,
      });
      return result;
    } catch (error) {
      context.logger.warning("architecture review method {method} failed", {
        method: methodName,
        ...identity,
      });
      throw error;
    }
  };
}

/** Publication-ready read-only architecture review model. */
const definition = {
  type: "@keyrage/architecture-development/review",
  version: "2026.09.21.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    reviewState: {
      description: "Durable review epoch state and immutable specialist selection",
      schema: ReviewStateSchema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    evidenceChunk: {
      description: "Bounded complete active-model evidence page",
      schema: EvidenceChunkSchema,
      lifetime: "infinite" as const,
      garbageCollection: 1000,
    },
    evidenceManifest: {
      description: "Completeness and revision manifest for collected evidence",
      schema: EvidenceManifestSchema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    specialistAssessments: {
      description: "Complete selected-specialist assessments for one epoch",
      schema: AssessmentRecordSchema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    synthesis: {
      description: "Complete deterministic synthesis and global recommendation ranking",
      schema: SynthesisSchema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    followup: {
      description: "User-directed selected-specialist dialogue",
      schema: FollowupSchema,
      lifetime: "infinite" as const,
      garbageCollection: 500,
    },
    disposition: {
      description: "Explicit user disposition and rationale",
      schema: DispositionSchema,
      lifetime: "infinite" as const,
      garbageCollection: 500,
    },
    reviewStateV2: {
      description: "Versioned v2 review state",
      schema: ReviewStateV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    evidenceChunkV2: {
      description: "Versioned complete active-model evidence page",
      schema: EvidenceChunkV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 1000,
    },
    evidenceManifestV2: {
      description: "Versioned completeness and revision manifest",
      schema: EvidenceManifestV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    roleSnapshotsV2: {
      description: "Immutable v2 specialist and lens evaluator snapshots",
      schema: RoleSnapshotRecordSchema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    specialistAssessmentsV2: {
      description: "Versioned v2 role assessments",
      schema: AssessmentRecordV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    synthesisV2: {
      description: "Versioned v2 deterministic synthesis",
      schema: SynthesisV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 100,
    },
    followupV2: {
      description: "Versioned v2 role-qualified follow-up",
      schema: FollowupV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 500,
    },
    dispositionV2: {
      description: "Versioned v2 role-qualified disposition",
      schema: DispositionV2Schema,
      lifetime: "infinite" as const,
      garbageCollection: 500,
    },
  },
  checks: {
    "review-configuration": {
      description: "Require non-secret model metadata and a vault-resolved bearer identity before execution.",
      labels: ["policy"],
      execute: (
        context: { globalArgs?: Partial<GlobalArgs> },
      ): { pass: boolean; errors?: string[] } => {
        const args = context.globalArgs;
        if (!args?.modelId || !args.endpointFile || !args.bearerToken) {
          return {
            pass: false,
            errors: [
              "modelId, endpointFile, and vault-backed bearerToken are required",
            ],
          };
        }
        return { pass: true };
      },
    },
  },
  methods: {
    start_review: {
      description: "Start a new immutable review epoch with expected groups and a non-empty specialist subset.",
      arguments: startMethodInput,
      execute: async (
        args: z.infer<typeof StartArgumentsSchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const selected = canonicalSelection(args.selectedSpecialists);
        const epoch = args.epoch ?? 1;
        const existing = await context.readResource?.(
          instanceName("reviewState", args.reviewId, epoch),
        );
        if (existing) {
          throw new Error(
            "review epoch already exists; use resume or start a new epoch",
          );
        }
        const state: ReviewState = ReviewStateSchema.parse({
          reviewId: args.reviewId,
          epoch,
          phase: "collecting",
          modelId: context.globalArgs.modelId,
          expectedGroups: args.expectedGroups,
          selectedSpecialists: selected,
          updatedAt: now(),
        });
        const handle = await writeState(context, state);
        return {
          dataHandles: [handle],
          reviewId: state.reviewId,
          epoch: state.epoch,
          selectedSpecialists: state.selectedSpecialists,
        };
      },
    },
    start_review_v2: {
      description: "Start a versioned review epoch with explicit specialist and lens selection snapshots.",
      arguments: v2StartInput,
      execute: async (
        args: z.infer<typeof v2StartInput>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const selected = canonicalRoles(
          args.selectedSpecialists,
          args.selectedLenses,
        );
        const epoch = args.epoch ?? 1;
        const stateName = v2Name("reviewState", args.reviewId, epoch);
        if (
          await context.readResource?.(stateName) ||
          await context.readResource?.(roleSnapshotResourceName(args.reviewId, epoch))
        ) {
          throw new Error("review epoch already exists; use a fresh epoch");
        }
        const snapshots = await roleSnapshots(
          selected.specialists,
          selected.lenses,
        );
        const snapshotName = roleSnapshotResourceName(args.reviewId, epoch);
        const snapshotRecord = RoleSnapshotRecordSchema.parse({
          recordVersion: 2,
          reviewId: args.reviewId,
          epoch,
          snapshots,
          recordedAt: now(),
        });
        await context.writeResource(
          "roleSnapshotsV2",
          snapshotName,
          snapshotRecord,
        );
        const state = ReviewStateV2Schema.parse({
          recordVersion: 2,
          reviewId: args.reviewId,
          epoch,
          phase: "collecting",
          modelId: context.globalArgs.modelId,
          expectedGroups: args.expectedGroups ?? ["Application", "Technology"],
          selectedSpecialists: selected.specialists,
          selectedLenses: selected.lenses,
          roleSnapshotResourceName: snapshotName,
          updatedAt: now(),
        });
        const handle = await context.writeResource(
          "reviewStateV2",
          stateName,
          state,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle],
          reviewId: args.reviewId,
          epoch,
          selectedSpecialists: selected.specialists,
          selectedLenses: selected.lenses,
          roleSnapshotResourceName: snapshotName,
        };
      },
    },
    collect_evidence_v2: {
      description: "Collect complete revision-coherent evidence for a versioned lens review.",
      arguments: v2IdentityInput,
      rollbackOnFailure: true,
      execute: async (
        args: { schemaVersion: 2; reviewId: string; epoch: number },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase !== "collecting") {
          throw new Error("v2 collection requires collecting phase");
        }
        await readV2Snapshots(context, state);
        const result = await collectEvidence({
          reviewId: args.reviewId,
          epoch: args.epoch,
          endpointFile: context.globalArgs.endpointFile,
          modelId: context.globalArgs.modelId,
          bearerToken: context.globalArgs.bearerToken,
          fetcher: context.fetcher,
          recordVersion: 2,
        }, context);
        const next = ReviewStateV2Schema.parse({
          ...state,
          phase: "assessing",
          publishedRevision: result.revision,
          updatedAt: now(),
        });
        const handle = await context.writeResource(
          "reviewStateV2",
          v2Name("reviewState", args.reviewId, args.epoch),
          next,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle],
          reviewId: args.reviewId,
          epoch: args.epoch,
          revision: result.revision,
          counts: result.counts,
          restarted: result.restarted,
          selectedSpecialists: state.selectedSpecialists,
          selectedLenses: state.selectedLenses,
          roleSnapshotResourceName: state.roleSnapshotResourceName,
        };
      },
    },
    record_assessments_v2: {
      description: "Record exactly one strict versioned assessment for every selected specialist or lens.",
      arguments: v2AssessmentInput,
      execute: async (
        args: z.infer<typeof v2AssessmentInput>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (
          state.phase !== "assessing" || state.publishedRevision === undefined
        ) {
          throw new Error(
            "v2 assessment recording requires completed collection",
          );
        }
        await validateV2Assessments(context, state, args.assessments);
        const record = AssessmentRecordV2Schema.parse({
          recordVersion: 2,
          reviewId: args.reviewId,
          epoch: args.epoch,
          modelId: state.modelId,
          publishedRevision: state.publishedRevision,
          assessments: args.assessments,
          recordedAt: now(),
        });
        const handle = await context.writeResource(
          "specialistAssessmentsV2",
          v2Name("specialistAssessments", args.reviewId, args.epoch),
          record,
        );
        const next = ReviewStateV2Schema.parse({
          ...state,
          phase: "synthesizing",
          updatedAt: now(),
        });
        const stateHandle = await context.writeResource(
          "reviewStateV2",
          v2Name("reviewState", args.reviewId, args.epoch),
          next,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle, stateHandle],
          roles: args.assessments.map((assessment) => ({
            roleKind: assessment.roleKind,
            roleId: assessment.roleId,
          })),
        };
      },
    },
    record_synthesis_v2: {
      description: "Validate and persist complete deterministic versioned synthesis.",
      arguments: v2SynthesisInput,
      execute: async (
        args: z.infer<typeof v2SynthesisInput>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase !== "synthesizing") {
          throw new Error("v2 synthesis requires synthesizing phase");
        }
        const parsedAssessments = await readV2Assessments(context, state);
        const synthesis = validateV2Synthesis(parsedAssessments.assessments, args.synthesis);
        if (
          synthesis.reviewId !== args.reviewId || synthesis.epoch !== args.epoch ||
          synthesis.modelId !== state.modelId ||
          synthesis.publishedRevision !== state.publishedRevision
        ) {
          throw new Error("v2 synthesis identity does not match state");
        }
        const handle = await context.writeResource(
          "synthesisV2",
          v2Name("synthesis", args.reviewId, args.epoch),
          synthesis,
        );
        const next = ReviewStateV2Schema.parse({
          ...state,
          phase: "dialogue",
          updatedAt: now(),
        });
        const stateHandle = await context.writeResource(
          "reviewStateV2",
          v2Name("reviewState", args.reviewId, args.epoch),
          next,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle, stateHandle],
          strengths: synthesis.strengths,
          topTen: synthesis.recommendations.slice(0, 10),
          recommendationCount: synthesis.recommendations.length,
          orderedQualifiedFindingKeys: synthesis.orderedQualifiedFindingKeys,
          sourceReferenceCounts: synthesis.sourceReferenceCounts,
        };
      },
    },
    record_followup_v2: {
      description: "Record role-qualified versioned dialogue against a persisted recommendation.",
      arguments: v2FollowupInput,
      execute: async (
        args: z.infer<typeof v2FollowupInput>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase !== "dialogue") {
          throw new Error("v2 follow-up requires dialogue phase");
        }
        const synthesis = await context.readResource?.(
          v2Name("synthesis", args.reviewId, args.epoch),
        );
        if (!synthesis) throw new Error("v2 persisted synthesis is missing");
        const parsedSynthesis = await validatePersistedV2Synthesis(context, state, synthesis);
        if (!selectedRole(state, args.roleKind, args.roleId)) {
          throw new Error("v2 follow-up role was not selected");
        }
        if (
          !parsedSynthesis.recommendations.some((
            recommendation,
          ) =>
            recommendation.recommendationId === args.recommendationId &&
            recommendation.qualifiedSourceFindingKeys.some((key) =>
              qualifiedKeyRoleMatches(key, args.roleKind, args.roleId)
            )
          )
        ) {
          throw new Error(
            "v2 follow-up recommendation or role was not selected",
          );
        }
        const record = FollowupV2Schema.parse({
          recordVersion: 2,
          reviewId: args.reviewId,
          epoch: args.epoch,
          sequence: args.sequence,
          recommendationId: args.recommendationId,
          roleKind: args.roleKind,
          roleId: args.roleId,
          question: args.question,
          response: args.response,
          recordedAt: now(),
        });
        const handle = await context.writeResource(
          "followupV2",
          v2Name("followup", args.reviewId, args.epoch, args.sequence),
          record,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle],
          roleKind: args.roleKind,
          roleId: args.roleId,
        };
      },
    },
    disposition_v2: {
      description: "Record an explicit role-qualified versioned disposition.",
      arguments: v2DispositionInput,
      execute: async (
        args: z.infer<typeof v2DispositionInput>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase !== "dialogue") {
          throw new Error("v2 disposition requires dialogue phase");
        }
        const synthesis = await context.readResource?.(
          v2Name("synthesis", args.reviewId, args.epoch),
        );
        if (!synthesis) throw new Error("v2 persisted synthesis is missing");
        const parsedSynthesis = await validatePersistedV2Synthesis(context, state, synthesis);
        if (!selectedRole(state, args.roleKind, args.roleId)) {
          throw new Error("v2 disposition role was not selected");
        }
        if (
          !parsedSynthesis.recommendations.some((
            recommendation,
          ) =>
            recommendation.recommendationId === args.recommendationId &&
            recommendation.qualifiedSourceFindingKeys.some((key) =>
              qualifiedKeyRoleMatches(key, args.roleKind, args.roleId)
            )
          )
        ) {
          throw new Error(
            "v2 disposition recommendation was not persisted for the selected role",
          );
        }
        const record = DispositionV2Schema.parse({
          recordVersion: 2,
          reviewId: args.reviewId,
          epoch: args.epoch,
          recommendationId: args.recommendationId,
          roleKind: args.roleKind,
          roleId: args.roleId,
          disposition: args.disposition,
          rationale: args.rationale,
          recordedAt: now(),
        });
        const handle = await context.writeResource(
          "dispositionV2",
          v2Name(
            "disposition",
            args.reviewId,
            args.epoch,
            args.recommendationId,
          ),
          record,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle],
          disposition: record.disposition,
          roleKind: args.roleKind,
          roleId: args.roleId,
        };
      },
    },
    status_v2: {
      description: "Read a versioned review state and its persisted immutable role snapshots.",
      arguments: v2IdentityInput,
      execute: async (
        args: { schemaVersion: 2; reviewId: string; epoch: number },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        const snapshots = await readV2Snapshots(context, state);
        return {
          schemaVersion: 2,
          state,
          selectedSpecialists: state.selectedSpecialists,
          selectedLenses: state.selectedLenses,
          roleSnapshotResourceName: state.roleSnapshotResourceName,
          snapshots: snapshots.map((snapshot) => ({
            roleKind: snapshot.roleKind,
            roleId: snapshot.roleId,
            evaluatorVersion: snapshot.evaluatorVersion,
            snapshotDigest: snapshot.snapshotDigest,
          })),
        };
      },
    },
    stop_v2: {
      description: "Stop a versioned review without changing its immutable selection or snapshots.",
      arguments: v2IdentityInput,
      execute: async (
        args: { schemaVersion: 2; reviewId: string; epoch: number },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase === "complete" || state.phase === "stopped") {
          throw new Error("v2 review is already stopped or complete");
        }
        await readV2Snapshots(context, state);
        if (await inferStoppedV2Phase(context, state) !== state.phase) {
          throw new Error("v2 phase does not match its persisted lifecycle records");
        }
        const next = ReviewStateV2Schema.parse({
          ...state,
          phase: "stopped",
          updatedAt: now(),
        });
        const handle = await context.writeResource(
          "reviewStateV2",
          v2Name("reviewState", args.reviewId, args.epoch),
          next,
        );
        return {
          schemaVersion: 2,
          dataHandles: [handle],
          stopped: true,
          epoch: state.epoch,
          selectedSpecialists: state.selectedSpecialists,
          selectedLenses: state.selectedLenses,
          roleSnapshotResourceName: state.roleSnapshotResourceName,
        };
      },
    },
    resume_v2: {
      description: "Resume from persisted snapshots, or create a fresh epoch when the published revision changed.",
      arguments: v2IdentityInput,
      execute: async (
        args: { schemaVersion: 2; reviewId: string; epoch: number },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readV2State(context, args.reviewId, args.epoch);
        if (state.phase !== "stopped") {
          throw new Error("v2 resume requires a stopped review");
        }
        const snapshots = await readV2Snapshots(context, state);
        const stoppedFromPhase = await inferStoppedV2Phase(context, state);
        let sameEpoch = state.publishedRevision === undefined;
        if (!sameEpoch) {
          const current = await discover({
            endpointFile: context.globalArgs.endpointFile,
            modelId: context.globalArgs.modelId,
            bearerToken: context.globalArgs.bearerToken,
            fetcher: context.fetcher,
          });
          sameEpoch = current.publishedRevision === state.publishedRevision;
        }
        if (sameEpoch) {
          const next = ReviewStateV2Schema.parse({
            ...state,
            phase: stoppedFromPhase,
            updatedAt: now(),
          });
          const handle = await context.writeResource(
            "reviewStateV2",
            v2Name("reviewState", state.reviewId, state.epoch),
            next,
          );
          return {
            schemaVersion: 2,
            dataHandles: [handle],
            freshAssessmentRequired: false,
            epoch: state.epoch,
            selectedSpecialists: state.selectedSpecialists,
            selectedLenses: state.selectedLenses,
            roleSnapshotResourceName: state.roleSnapshotResourceName,
          };
        }
        const nextEpoch = state.epoch + 1;
        if (
          await context.readResource?.(
            v2Name("reviewState", state.reviewId, nextEpoch),
          ) ||
          await context.readResource?.(
            roleSnapshotResourceName(state.reviewId, nextEpoch),
          )
        ) throw new Error("v2 next epoch is already occupied");
        const snapshotName = roleSnapshotResourceName(
          state.reviewId,
          nextEpoch,
        );
        const snapshotRecord = RoleSnapshotRecordSchema.parse({
          recordVersion: 2,
          reviewId: state.reviewId,
          epoch: nextEpoch,
          snapshots,
          recordedAt: now(),
        });
        const snapshotHandle = await context.writeResource(
          "roleSnapshotsV2",
          snapshotName,
          snapshotRecord,
        );
        const next = ReviewStateV2Schema.parse({
          ...state,
          epoch: nextEpoch,
          phase: "collecting",
          publishedRevision: undefined,
          roleSnapshotResourceName: snapshotName,
          updatedAt: now(),
        });
        const handle = await context.writeResource(
          "reviewStateV2",
          v2Name("reviewState", state.reviewId, nextEpoch),
          next,
        );
        return {
          schemaVersion: 2,
          dataHandles: [snapshotHandle, handle],
          freshAssessmentRequired: true,
          priorEpoch: state.epoch,
          epoch: nextEpoch,
          selectedSpecialists: state.selectedSpecialists,
          selectedLenses: state.selectedLenses,
          roleSnapshotResourceName: snapshotName,
        };
      },
    },
    status: {
      description: "Read the durable review epoch state without resolving or exposing credentials.",
      arguments: identityMethodInput,
      execute: async (
        args: z.infer<typeof ReviewIdentitySchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => ({
        state: await readState(context, args.reviewId, args.epoch),
      }),
    },
    collect_evidence: {
      description:
        "Collect every active folder, element, and relationship page coherently before publishing evidence resources.",
      rollbackOnFailure: true,
      arguments: identityMethodInput,
      execute: async (
        args: z.infer<typeof ReviewIdentitySchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        assertSameEpoch(state, args.reviewId, args.epoch);
        if (state.phase !== "collecting") {
          throw new Error(
            `evidence collection requires collecting phase, got '${state.phase}'`,
          );
        }
        const result = await collectEvidence({
          reviewId: args.reviewId,
          epoch: args.epoch,
          endpointFile: context.globalArgs.endpointFile,
          modelId: context.globalArgs.modelId,
          bearerToken: context.globalArgs.bearerToken,
          fetcher: context.fetcher,
        }, context);
        const next = ReviewStateSchema.parse({
          ...state,
          phase: "assessing",
          publishedRevision: result.revision,
          apiVersion: "v1",
          graphContractVersion: 2,
          updatedAt: now(),
        });
        const stateHandle = await writeState(context, next);
        return {
          dataHandles: [stateHandle],
          reviewId: args.reviewId,
          epoch: args.epoch,
          revision: result.revision,
          counts: result.counts,
          restarted: result.restarted,
        };
      },
    },
    record_assessments: {
      description: "Atomically record exactly one complete assessment for every selected specialist.",
      arguments: assessmentMethodInput,
      execute: async (
        args: {
          reviewId: string;
          epoch: number;
          assessments: z.infer<typeof SpecialistAssessmentSchema>[];
        },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase !== "assessing") {
          throw new Error(
            `assessment recording requires assessing phase, got '${state.phase}'`,
          );
        }
        const normalized = normalizeAssessments(args.assessments, state);
        const record = AssessmentRecordSchema.parse({
          reviewId: args.reviewId,
          epoch: args.epoch,
          modelId: state.modelId,
          publishedRevision: state.publishedRevision,
          assessments: normalized,
          recordedAt: now(),
        });
        const handle = await context.writeResource(
          "specialistAssessments",
          instanceName("specialistAssessments", args.reviewId, args.epoch),
          record,
        );
        const stateHandle = await writeState(context, {
          ...state,
          phase: "synthesizing",
          updatedAt: now(),
        });
        return {
          dataHandles: [handle, stateHandle],
          specialists: normalized.map((assessment) => assessment.specialist),
        };
      },
    },
    record_synthesis: {
      description: "Validate complete finding coverage and persist deterministic global ranking.",
      arguments: synthesisMethodInput,
      execute: async (
        args: {
          reviewId: string;
          epoch: number;
          synthesis: z.infer<typeof SynthesisSchema>;
        },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase !== "synthesizing") {
          throw new Error(
            `synthesis requires synthesizing phase, got '${state.phase}'`,
          );
        }
        const record = await context.readResource?.(
          instanceName("specialistAssessments", args.reviewId, args.epoch),
        );
        if (!record) {
          throw new Error(
            "selected specialist assessments are required before synthesis",
          );
        }
        const parsedAssessments = AssessmentRecordSchema.parse(record);
        assertPersistedIdentity(
          parsedAssessments,
          args.reviewId,
          args.epoch,
          state.modelId,
          state.publishedRevision,
        );
        const normalized = normalizeAssessments(parsedAssessments.assessments, state);
        if (
          normalized.some((assessment, index) =>
            assessment.specialist !== parsedAssessments.assessments[index]?.specialist
          )
        ) {
          throw new Error("persisted V1 assessments must be in canonical specialist order");
        }
        const synthesis = assertSynthesisCoverage(normalized, args.synthesis);
        if (
          synthesis.reviewId !== args.reviewId || synthesis.epoch !== args.epoch ||
          synthesis.modelId !== state.modelId ||
          synthesis.publishedRevision !== state.publishedRevision
        ) {
          throw new Error(
            "synthesis identity does not match the reviewed revision",
          );
        }
        const ranked = SynthesisSchema.parse({
          ...synthesis,
          recommendations: rankRecommendations(synthesis.recommendations),
        });
        const handle = await context.writeResource(
          "synthesis",
          instanceName("synthesis", args.reviewId, args.epoch),
          ranked,
        );
        const stateHandle = await writeState(context, {
          ...state,
          phase: "dialogue",
          updatedAt: now(),
        });
        return {
          dataHandles: [handle, stateHandle],
          strengths: ranked.strengths,
          topTen: ranked.recommendations.slice(0, 10),
          recommendationCount: ranked.recommendations.length,
        };
      },
    },
    record_followup: {
      description: "Record a question and response from a selected specialist only.",
      arguments: followupMethodInput,
      execute: async (
        args: {
          reviewId: string;
          epoch: number;
          sequence: number;
          recommendationId: string;
          specialist: string;
          question: string;
          response: string;
        },
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase !== "dialogue") {
          throw new Error("follow-up requires dialogue phase");
        }
        const specialist = canonicalSelection([args.specialist])[0];
        if (!specialist || !state.selectedSpecialists.includes(specialist)) {
          throw new Error(
            "follow-up specialist was not selected for this review epoch",
          );
        }
        await requireV1Recommendation(
          context,
          state,
          args.reviewId,
          args.epoch,
          args.recommendationId,
        );
        const record = FollowupSchema.parse({
          ...args,
          specialist,
          recordedAt: now(),
        });
        const handle = await context.writeResource(
          "followup",
          instanceName("followup", args.reviewId, args.epoch, args.sequence),
          record,
        );
        return { dataHandles: [handle], specialist };
      },
    },
    disposition: {
      description: "Record an explicit user disposition and concise rationale without inferring approval.",
      arguments: dispositionMethodInput,
      execute: async (
        args: z.infer<typeof DispositionSchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase !== "dialogue") {
          throw new Error("disposition requires dialogue phase");
        }
        await requireV1Recommendation(
          context,
          state,
          args.reviewId,
          args.epoch,
          args.recommendationId,
        );
        const record = DispositionSchema.parse({ ...args, recordedAt: now() });
        const handle = await context.writeResource(
          "disposition",
          instanceName(
            "disposition",
            args.reviewId,
            args.epoch,
            args.recommendationId,
          ),
          record,
        );
        return { dataHandles: [handle], disposition: record.disposition };
      },
    },
    stop: {
      description: "Stop a review while preserving every durable epoch record.",
      arguments: identityMethodInput,
      execute: async (
        args: z.infer<typeof ReviewIdentitySchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase === "complete" || state.phase === "stopped") {
          throw new Error("review is already stopped or complete");
        }
        const handle = await writeState(context, {
          ...state,
          phase: "stopped",
          updatedAt: now(),
        });
        return { dataHandles: [handle], stopped: true };
      },
    },
    resume: {
      description: "Resume unchanged dialogue or create a fresh epoch after a published revision movement.",
      arguments: identityMethodInput,
      execute: async (
        args: z.infer<typeof ReviewIdentitySchema>,
        context: Context,
      ): Promise<Record<string, unknown>> => {
        const state = await readState(context, args.reviewId, args.epoch);
        if (state.phase !== "stopped") {
          throw new Error("resume requires a stopped review");
        }
        const current = await discover({
          endpointFile: context.globalArgs.endpointFile,
          modelId: context.globalArgs.modelId,
          bearerToken: context.globalArgs.bearerToken,
          fetcher: context.fetcher,
        });
        if (
          state.publishedRevision === undefined ||
          current.publishedRevision === state.publishedRevision
        ) {
          const handle = await writeState(context, {
            ...state,
            phase: "dialogue",
            updatedAt: now(),
          });
          return {
            dataHandles: [handle],
            freshAssessmentRequired: false,
            epoch: state.epoch,
          };
        }
        const next: ReviewState = ReviewStateSchema.parse({
          ...state,
          epoch: state.epoch + 1,
          phase: "collecting",
          publishedRevision: undefined,
          updatedAt: now(),
        });
        const handle = await writeState(context, next);
        return {
          dataHandles: [handle],
          freshAssessmentRequired: true,
          priorEpoch: state.epoch,
          epoch: next.epoch,
        };
      },
    },
  },
};

type MethodDefinition = {
  execute: (
    args: unknown,
    context: Context,
  ) => Promise<Record<string, unknown>>;
  arguments?: z.ZodTypeAny;
  [key: string]: unknown;
};
const internalMethods = definition.methods as unknown as Record<
  string,
  MethodDefinition
>;
function signalsV2(args: unknown): boolean {
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  const value = args as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
    Object.prototype.hasOwnProperty.call(value, "recordVersion") ||
    Object.prototype.hasOwnProperty.call(value, "selectedLenses") ||
    Object.prototype.hasOwnProperty.call(value, "roleKind") ||
    Object.prototype.hasOwnProperty.call(value, "roleId");
}

/** Route by V2 signal before parsing, preventing malformed V2 fallback to V1 strip schemas. */
function routedArguments(
  v1Arguments: z.ZodTypeAny,
  v2Arguments: z.ZodTypeAny,
): z.ZodTypeAny {
  return z.preprocess((value, context) => {
    const branch = signalsV2(value) ? v2Arguments : v1Arguments;
    const parsed = branch.safeParse(value);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? "invalid routed method arguments",
      });
      return z.NEVER;
    }
    return parsed.data;
  }, z.unknown());
}

function routedMethod(
  v1Name: string,
  v2Name: string,
  v1Arguments: z.ZodTypeAny,
  v2Arguments: z.ZodTypeAny,
): MethodDefinition {
  const v1 = internalMethods[v1Name];
  const v2 = internalMethods[v2Name];
  return {
    description: `${v1?.description ?? v1Name} (schema-version routed)`,
    ...(v1?.rollbackOnFailure === true || v2?.rollbackOnFailure === true ? { rollbackOnFailure: true } : {}),
    arguments: routedArguments(v1Arguments, v2Arguments),
    execute: async (
      args: unknown,
      context: Context,
    ): Promise<Record<string, unknown>> => {
      const isV2 = signalsV2(args);
      const target = internalMethods[isV2 ? v2Name : v1Name];
      if (!target) {
        throw new Error(`missing routed method ${isV2 ? v2Name : v1Name}`);
      }
      const parsed = (isV2 ? v2Arguments : v1Arguments).parse(args);
      return await target.execute(parsed, context);
    },
  };
}
const publicMethods: Record<string, MethodDefinition> = { ...internalMethods };
for (
  const name of [
    "start_review",
    "status",
    "collect_evidence",
    "record_assessments",
    "record_synthesis",
    "record_followup",
    "disposition",
    "stop",
    "resume",
  ]
) {
  const v2Name = `${name}_v2`;
  const v1 = internalMethods[name];
  const v2 = internalMethods[v2Name];
  if (!v1 || !v2) {
    throw new Error(`missing routed method pair ${name}/${v2Name}`);
  }
  publicMethods[name] = routedMethod(
    name,
    v2Name,
    v1.arguments!,
    v2.arguments!,
  );
  delete publicMethods[v2Name];
}
const loggedMethods = Object.fromEntries(
  Object.entries(publicMethods).map(([name, method]) => [
    name,
    { ...method, execute: withMethodLogging(name, method.execute) },
  ]),
);

export const model = { ...definition, methods: loggedMethods };

/** Host-facing specialist scheduling seam used by agent orchestration adapters. */
export { executeSelectedSpecialists } from "./_lib/specialist_execution.ts";
/** Public declaration-driven v2 lens contracts and applicability helpers. */
export {
  canonicalRoles,
  classifyLens,
  LENS_DESCRIPTIONS,
  LENS_ORDER,
  lensDeclaration,
  qualifiedFindingKey,
  validateV2Synthesis,
} from "./_lib/lenses.ts";
