import { type Finding, type Recommendation, RecommendationSchema } from "./schemas.ts";

/** Calculate the documented deterministic recommendation score (10–50). */
export function recommendationScore(
  impact: number,
  confidence: number,
  scope: number,
  effort: number,
): number {
  return impact * 4 + confidence * 3 + scope * 2 + (6 - effort);
}

/** Stable global ordering: score first, then explained component tie-breaks and ID. */
export function compareRecommendations(
  a: Recommendation,
  b: Recommendation,
): number {
  return b.score - a.score || b.impact - a.impact ||
    b.confidence - a.confidence || b.scope - a.scope || a.effort - b.effort ||
    a.recommendationId.localeCompare(b.recommendationId);
}

/** Validate, score, and deterministically rank synthesized recommendations. */
export function rankRecommendations(
  recommendations: readonly Recommendation[],
): Recommendation[] {
  const checked = recommendations.map((recommendation) => {
    const score = recommendationScore(
      recommendation.impact,
      recommendation.confidence,
      recommendation.scope,
      recommendation.effort,
    );
    return RecommendationSchema.parse({
      ...recommendation,
      score,
      scoreExplanation:
        `impact(${recommendation.impact})*4 + confidence(${recommendation.confidence})*3 + scope(${recommendation.scope})*2 + (6-effort(${recommendation.effort})) = ${score}`,
    });
  });
  return checked.sort(compareRecommendations);
}

/** Build a deterministic default recommendation from a finding when a harness needs one. */
export function findingAsRecommendation(finding: Finding): Recommendation {
  const impact = finding.impact ?? 3;
  const confidence = finding.confidence ?? 3;
  const scope = finding.scope ?? 3;
  const effort = finding.effort ?? 3;
  const score = recommendationScore(impact, confidence, scope, effort);
  return RecommendationSchema.parse({
    recommendationId: `recommendation-${finding.findingId}`,
    title: finding.title,
    statement: finding.statement,
    sourceFindingIds: [finding.findingId],
    citations: finding.citations,
    impact,
    confidence,
    scope,
    effort,
    score,
    scoreExplanation:
      `impact(${impact})*4 + confidence(${confidence})*3 + scope(${scope})*2 + (6-effort(${effort})) = ${score}`,
  });
}
