import { z } from "npm:zod@4";

/** ArchiMate groups used when judging expected coverage. */
export const ExpectedGroupSchema = z.enum([
  "Motivation",
  "Strategy",
  "Business",
  "Application",
  "Technology",
  "Physical",
  "Implementation & Migration",
]);
export type ExpectedGroup = z.infer<typeof ExpectedGroupSchema>;

/** The fixed specialist passes shipped by the first review slice. */
export const SpecialistIdSchema = z.enum([
  "completeness",
  "crossLayerTraceability",
  "documentationClarity",
  "motivationStrategy",
  "repositoryAlignment",
  "derivedRelationships",
]);
export type SpecialistId = z.infer<typeof SpecialistIdSchema>;
export const SPECIALIST_ORDER: readonly SpecialistId[] = SpecialistIdSchema.options;
export const SPECIALIST_DESCRIPTIONS: Record<SpecialistId, string> = {
  completeness: "Find missing concepts and assess coverage of the active semantic model.",
  crossLayerTraceability: "Assess understandable traceability across the expected ArchiMate layers.",
  documentationClarity: "Assess names, documentation, responsibilities, boundaries, and ambiguity.",
  motivationStrategy:
    "Assess Motivation and Strategy stakeholders, drivers, goals, capabilities, and courses of action.",
  repositoryAlignment: "Compare executable-design references with only the referenced repository evidence.",
  derivedRelationships: "Suggest confidence-rated derived relationships as advisory findings, never validation.",
};

export const ExpectedGroupsSchema = z.array(ExpectedGroupSchema).min(1).max(7)
  .refine(
    (groups) => new Set(groups).size === groups.length,
    "expectedGroups must not contain duplicates",
  );
export const SelectedSpecialistsSchema = z.array(SpecialistIdSchema).min(1).max(
  6,
).refine(
  (roles) => new Set(roles).size === roles.length,
  "selectedSpecialists must be a non-empty unique subset",
);

/** Normalize arbitrary user ordering to the stable persisted role order. */
export function normalizeSpecialists(
  values: readonly SpecialistId[],
): SpecialistId[] {
  const selected = new Set(values);
  return SPECIALIST_ORDER.filter((role) => selected.has(role));
}

export const CitationSchema = z.object({
  canonicalId: z.string().min(1),
  path: z.string().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
}).strict().refine((citation) => {
  if (citation.path === undefined) {
    return citation.startLine === undefined && citation.endLine === undefined;
  }
  return citation.startLine !== undefined && citation.endLine !== undefined &&
    citation.endLine >= citation.startLine;
}, "repository citations require an ordered line range");

export const FindingCategorySchema = z.enum([
  "observation",
  "interpretation",
  "assumption",
  "recommendation",
]);
export const FindingSchema = z.object({
  findingId: z.string().min(1),
  category: FindingCategorySchema,
  title: z.string().min(1),
  statement: z.string().min(1),
  canonicalIds: z.array(z.string().min(1)).min(1),
  citations: z.array(CitationSchema),
  impact: z.number().int().min(1).max(5).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  scope: z.number().int().min(1).max(5).optional(),
  effort: z.number().int().min(1).max(5).optional(),
}).strict();
export type Finding = z.infer<typeof FindingSchema>;

export const SpecialistAssessmentSchema = z.object({
  specialist: SpecialistIdSchema,
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  findings: z.array(FindingSchema),
  strengths: z.array(z.string().min(1)),
  completedAt: z.string().datetime(),
}).strict();
export type SpecialistAssessment = z.infer<typeof SpecialistAssessmentSchema>;

export const RecommendationSchema = z.object({
  recommendationId: z.string().min(1),
  title: z.string().min(1),
  statement: z.string().min(1),
  sourceFindingIds: z.array(z.string().min(1)).min(1),
  citations: z.array(CitationSchema),
  impact: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
  scope: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  score: z.number().int().min(10).max(50),
  scoreExplanation: z.string().min(1),
}).strict();
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const ReviewStateSchema = z.object({
  reviewId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/),
  epoch: z.number().int().positive(),
  phase: z.enum([
    "collecting",
    "assessing",
    "synthesizing",
    "dialogue",
    "stopped",
    "complete",
  ]),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive().optional(),
  expectedGroups: ExpectedGroupsSchema,
  selectedSpecialists: SelectedSpecialistsSchema,
  apiVersion: z.literal("v1").optional(),
  graphContractVersion: z.literal(2).optional(),
  updatedAt: z.string().datetime(),
}).strict();
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const EvidenceChunkSchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  kind: z.enum(["folders", "elements", "relationships"]),
  items: z.array(z.record(z.string(), z.unknown())),
  itemCount: z.number().int().nonnegative(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const EvidenceManifestSchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  complete: z.literal(true),
  chunkCount: z.number().int().positive(),
  counts: z.object({
    folders: z.number().int().nonnegative(),
    elements: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
  }).strict(),
  collectedAt: z.string().datetime(),
  restarted: z.boolean(),
}).strict();
export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;

/** Versioned evidence records never share names or schemas with V1 records. */
export const EvidenceChunkV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  kind: z.enum(["folders", "elements", "relationships"]),
  items: z.array(z.record(z.string(), z.unknown())),
  itemCount: z.number().int().nonnegative(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const EvidenceManifestV2Schema = z.object({
  recordVersion: z.literal(2),
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  complete: z.literal(true),
  chunkCount: z.number().int().positive(),
  counts: z.object({
    folders: z.number().int().nonnegative(),
    elements: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
  }).strict(),
  collectedAt: z.string().datetime(),
  restarted: z.boolean(),
}).strict();

export const SynthesisSchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  modelId: z.string().min(1),
  publishedRevision: z.number().int().positive(),
  sourceFindingIds: z.array(z.string().min(1)),
  strengths: z.array(z.string().min(1)),
  recommendations: z.array(RecommendationSchema),
  synthesizedAt: z.string().datetime(),
}).strict();
export const FollowupSchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
  sequence: z.number().int().positive(),
  recommendationId: z.string().min(1),
  specialist: SpecialistIdSchema,
  question: z.string().min(1),
  response: z.string().min(1),
  recordedAt: z.string().datetime(),
}).strict();
export const DispositionSchema = z.object({
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
  recordedAt: z.string().datetime(),
}).strict();

/** Configuration persisted by one selectable model definition. */
export const GlobalArgsSchema = z.object({
  modelId: z.string().min(1),
  endpointFile: z.string().min(1),
  bearerToken: z.string().min(1).meta({ sensitive: true }),
  repositoryRoot: z.string().min(1).optional(),
}).strict();
export type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

export const StartArgumentsSchema = z.object({
  reviewId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/),
  expectedGroups: ExpectedGroupsSchema.default(["Application", "Technology"]),
  selectedSpecialists: SelectedSpecialistsSchema.optional(),
  epoch: z.number().int().positive().optional(),
}).strict();
export const ReviewIdentitySchema = z.object({
  reviewId: z.string().min(1),
  epoch: z.number().int().positive(),
}).strict();
