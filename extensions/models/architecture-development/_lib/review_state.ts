import {
  type ReviewState,
  ReviewStateSchema,
  SelectedSpecialistsSchema,
  SPECIALIST_ORDER,
  type SpecialistAssessment,
  SpecialistAssessmentSchema,
  type SpecialistId,
  SynthesisSchema,
} from "./schemas.ts";

/** Return canonical role order and reject an empty or unknown selection. */
export function canonicalSelection(
  input: readonly string[] | undefined,
): SpecialistId[] {
  const parsed = SelectedSpecialistsSchema.parse(
    input ?? [...SPECIALIST_ORDER],
  );
  const canonical = SPECIALIST_ORDER.filter((role) => parsed.includes(role));
  if (canonical.length === 0) {
    throw new Error(
      "selectedSpecialists must contain at least one known specialist",
    );
  }
  return canonical;
}

/** Ensure a new epoch has a unique review/epoch identity. */
export function instanceName(
  spec: string,
  reviewId: string,
  epoch: number,
  sequence: number | string = 0,
): string {
  const safe = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
  const record = String(sequence);
  if (
    !safe.test(reviewId) || !Number.isInteger(epoch) || epoch < 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(record)
  ) {
    throw new Error("invalid review identity");
  }
  return `${spec}-${reviewId}-e${epoch}-s${record}`;
}

/** Validate that a state transition and selection are coherent. */
export function assertState(state: unknown): ReviewState {
  return ReviewStateSchema.parse(state);
}
export function assertSameEpoch(
  state: ReviewState,
  reviewId: string,
  epoch: number,
): void {
  if (state.reviewId !== reviewId || state.epoch !== epoch) {
    throw new Error("review epoch is not active");
  }
}
export function assertSelectionImmutable(
  state: ReviewState,
  selection: readonly SpecialistId[],
): void {
  const canonical = canonicalSelection(selection);
  if (canonical.join(",") !== state.selectedSpecialists.join(",")) {
    throw new Error(
      "specialist selection is immutable within an epoch; stop and start a fresh epoch",
    );
  }
}

/** Normalize parallel completion and require exactly one result for every selected role. */
export function normalizeAssessments(
  input: readonly SpecialistAssessment[],
  state: ReviewState,
): SpecialistAssessment[] {
  const seen = new Set<string>();
  for (const assessment of input) {
    const parsed = SpecialistAssessmentSchema.parse(assessment);
    if (seen.has(parsed.specialist)) {
      throw new Error(
        `duplicate assessment for specialist '${parsed.specialist}'`,
      );
    }
    if (!state.selectedSpecialists.includes(parsed.specialist)) {
      throw new Error(
        `assessment for unselected specialist '${parsed.specialist}'`,
      );
    }
    if (
      parsed.modelId !== state.modelId ||
      parsed.publishedRevision !== state.publishedRevision
    ) {
      throw new Error(
        "assessment identity does not match the reviewed revision",
      );
    }
    seen.add(parsed.specialist);
  }
  if (
    seen.size !== state.selectedSpecialists.length ||
    state.selectedSpecialists.some((role) => !seen.has(role))
  ) {
    throw new Error(
      "assessments must contain exactly one result for every selected specialist",
    );
  }
  return SPECIALIST_ORDER.filter((role) => seen.has(role)).map((role) =>
    input.find((assessment) => assessment.specialist === role)!
  );
}

/** Require synthesis source-finding coverage to equal every selected finding ID exactly. */
export function assertSynthesisCoverage(
  assessments: readonly SpecialistAssessment[],
  synthesis: unknown,
): ReturnType<typeof SynthesisSchema.parse> {
  const parsed = SynthesisSchema.parse(synthesis);
  const expected = new Set(
    assessments.flatMap((assessment) => assessment.findings.map((finding) => finding.findingId)),
  );
  const actual = new Set(
    parsed.recommendations.flatMap((recommendation) => recommendation.sourceFindingIds),
  );
  if (
    expected.size !== actual.size || [...expected].some((id) => !actual.has(id))
  ) {
    throw new Error(
      "synthesis must cover every selected-assessment finding exactly",
    );
  }
  if (
    parsed.sourceFindingIds.length !== expected.size ||
    new Set(parsed.sourceFindingIds).size !== expected.size ||
    parsed.sourceFindingIds.some((id) => !expected.has(id))
  ) {
    throw new Error(
      "synthesis sourceFindingIds must equal the complete selected finding set",
    );
  }
  return parsed;
}

/** Resolve a model-referenced repository path and reject traversal or symlink escapes. */
export async function safeRepositoryPath(
  repositoryRoot: string,
  targetPath: string,
): Promise<string> {
  const root = await Deno.realPath(repositoryRoot);
  const candidate = await Deno.realPath(
    `${root.replace(/\/+$/, "")}/${targetPath}`,
  );
  const rel = candidate.startsWith(`${root}/`)
    ? candidate.slice(root.length + 1)
    : candidate === root
    ? ""
    : `../${candidate}`;
  if (
    rel === "" || rel.startsWith(".." + "/") || rel === ".." ||
    rel.startsWith("/")
  ) {
    throw new Error(
      "repository citation is outside the configured repository root",
    );
  }
  return candidate;
}

/** Verify a normalized executable-design target path before it is read. */
export function isNormalizedTargetPath(targetPath: string): boolean {
  return targetPath.length > 0 && targetPath.length <= 240 &&
    !targetPath.startsWith("/") && !targetPath.includes("\\") &&
    !targetPath.endsWith("/") &&
    targetPath.split("/").every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== "." && part !== "..");
}

/** Canonical model IDs used to tie citations to evidence. */
export function validateCitationLineRange(
  startLine: number,
  endLine: number,
  lineCount: number,
): void {
  if (
    !Number.isInteger(startLine) || !Number.isInteger(endLine) ||
    startLine < 1 || endLine < startLine || endLine > lineCount
  ) throw new Error("citation line range is outside the inspected file");
}
