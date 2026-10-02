import {
  classifyLens,
  deriveLensEvidence,
  lensDeclaration,
  qualifiedFindingKey,
  RoleAssessmentV2Schema,
  roleSnapshots,
} from "../_lib/lenses.ts";

const NOW = "2026-01-01T00:00:00.000Z";

/** Complete, independently stored V2 dependency chain for persisted-read adversaries. */
export async function persistedReview(
  reviewId: string,
  phase: "synthesizing" | "dialogue" | "stopped" = "synthesizing",
  mixed = true,
  findings = true,
  revision = 7,
) {
  const resources: Record<string, Record<string, unknown>> = {};
  const writes: string[] = [];
  const name = (spec: string, sequence: string | number = 0) => `${spec}V2-${reviewId}-e1-s${sequence}`;
  const identity = { reviewId, epoch: 1, modelId: "model-1", publishedRevision: revision };
  const snapshots = await roleSnapshots(["completeness"], mixed ? ["domain"] : []);
  resources[name("reviewState")] = {
    recordVersion: 2,
    ...identity,
    phase,
    expectedGroups: ["Application"],
    selectedSpecialists: ["completeness"],
    selectedLenses: mixed ? ["domain"] : [],
    roleSnapshotResourceName: name("roleSnapshots"),
    updatedAt: NOW,
  };
  resources[name("roleSnapshots")] = { recordVersion: 2, reviewId, epoch: 1, snapshots, recordedAt: NOW };
  const elements = [{ canonicalId: "element-1", type: "ApplicationComponent", properties: {} }];
  const evidence = deriveLensEvidence({ folders: [], elements, relationships: [] });
  for (const [sequence, kind] of (["folders", "elements", "relationships"] as const).entries()) {
    const items = kind === "elements" ? elements : [];
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(items)));
    resources[name("evidenceChunk", sequence)] = {
      recordVersion: 2,
      ...identity,
      sequence,
      kind,
      items,
      itemCount: items.length,
      digest: Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(""),
    };
  }
  resources[name("evidenceManifest")] = {
    recordVersion: 2,
    ...identity,
    complete: true,
    chunkCount: 3,
    counts: { folders: 0, elements: 1, relationships: 0 },
    collectedAt: NOW,
    restarted: false,
  };
  const source = qualifiedFindingKey("specialist", "completeness", "finding-1");
  const assessments = snapshots.map((snapshot) => {
    const common = {
      roleKind: snapshot.roleKind,
      roleId: snapshot.roleId,
      modelId: "model-1",
      publishedRevision: revision,
      definitionVersion: 1,
      evaluatorVersion: snapshot.evaluatorVersion,
      snapshotDigest: snapshot.snapshotDigest,
      missingEvidenceKeys: [],
      findings: [],
      strengths: [],
      completedAt: NOW,
    };
    if (snapshot.roleKind === "specialist" && snapshot.definitionSnapshot.kind === "specialist") {
      return RoleAssessmentV2Schema.parse({
        ...common,
        applicability: "applicable",
        checkedEvidenceKeys: snapshot.definitionSnapshot.requiredEvidenceKeys,
        evaluatedEvidenceKeys: snapshot.definitionSnapshot.requiredEvidenceKeys,
        limitations: snapshot.definitionSnapshot.limitations,
        findings: findings
          ? [{
            findingKey: source,
            localFindingId: "finding-1",
            roleKind: "specialist",
            roleId: "completeness",
            category: "observation",
            epistemicKind: "factual",
            title: "Persisted",
            statement: "Act on it",
            canonicalIds: ["element-1"],
            citations: [],
            confidence: 1,
          }]
          : [],
      });
    }
    const applicability = classifyLens("domain", evidence);
    return RoleAssessmentV2Schema.parse({
      ...common,
      applicability: applicability.applicability,
      applicabilityRationale: applicability.rationale,
      checkedEvidenceKeys: applicability.checkedEvidenceKeys,
      evaluatedEvidenceKeys: applicability.evaluatedEvidenceKeys,
      limitations: lensDeclaration("domain").limitations,
    });
  });
  resources[name("specialistAssessments")] = { recordVersion: 2, ...identity, assessments, recordedAt: NOW };
  const synthesis = {
    recordVersion: 2,
    ...identity,
    orderedQualifiedFindingKeys: findings ? [source] : [],
    sourceReferenceCounts: findings ? [{ qualifiedFindingKey: source, count: 1 }] : [],
    strengths: [],
    recommendations: findings
      ? [{
        recommendationId: "r2-00000001",
        title: "Persisted",
        statement: "Act on it",
        qualifiedSourceFindingKeys: [source],
        citations: [],
        impact: 1,
        confidence: 1,
        scope: 1,
        effort: 1,
        score: 14,
        scoreExplanation: "impact(1)*4 + confidence(1)*3 + scope(1)*2 + (6-effort(1)) = 14",
        epistemic: {
          mode: "factual",
          factualSourceKeys: [source],
          heuristicSourceKeys: [],
          basisSources: [],
          limitationSources: [],
          limitations: [],
        },
      }]
      : [],
    synthesizedAt: NOW,
  };
  if (phase !== "synthesizing") resources[name("synthesis")] = structuredClone(synthesis);
  const context = {
    globalArgs: { modelId: "model-1", endpointFile: "/tmp/unused", bearerToken: "dummy-fixture-token" },
    logger: { info: () => {}, warning: () => {} },
    readResource: (key: string) => Promise.resolve(resources[key] ? structuredClone(resources[key]) : null),
    writeResource: (spec: string, key: string, data: Record<string, unknown>) => {
      writes.push(`${spec}:${key}`);
      resources[key] = structuredClone(data);
      return Promise.resolve({ name: key });
    },
  };
  return { resources, writes, name, context, synthesis, assessments };
}
