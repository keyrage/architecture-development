import {
  collectComplete,
  evidenceChunk,
  evidenceManifest,
  QueryBoundaryError,
  type QueryClientOptions,
} from "./agent_query.ts";
import { EvidenceChunkV2Schema, EvidenceManifestV2Schema } from "./schemas.ts";
import { instanceName } from "./review_state.ts";

export interface ResourceWriter {
  writeResource(
    specName: string,
    instanceName: string,
    data: Record<string, unknown>,
  ): Promise<{ name: string }>;
}
export interface EvidenceCollectionInput extends QueryClientOptions {
  reviewId: string;
  epoch: number;
  recordVersion?: 1 | 2;
}

/**
 * Collect a complete coherent active model, retrying one revision movement and
 * writing durable chunks only after the successful attempt has fully validated.
 */
export async function collectEvidence(
  input: EvidenceCollectionInput,
  writer: ResourceWriter,
): Promise<Record<string, unknown>> {
  const root = await Deno.makeTempDir({ prefix: "architecture-review-" });
  let restarted = false;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await collectComplete(input, root);
        if (restarted) result.restarted = true;
        const handles: { name: string }[] = [];
        let sequence = 0;
        for (const kind of ["folders", "elements", "relationships"] as const) {
          for (const items of result.pages[kind]) {
            const chunk = await evidenceChunk(
              input.reviewId,
              input.epoch,
              sequence,
              input.modelId,
              result.discovery.publishedRevision,
              kind,
              items,
            );
            const version = input.recordVersion ?? 1;
            const record = version === 2 ? EvidenceChunkV2Schema.parse({ recordVersion: 2, ...chunk }) : chunk;
            handles.push(
              await writer.writeResource(
                version === 2 ? "evidenceChunkV2" : "evidenceChunk",
                instanceName(
                  version === 2 ? "evidenceChunkV2" : "evidenceChunk",
                  input.reviewId,
                  input.epoch,
                  sequence,
                ),
                record,
              ),
            );
            sequence++;
          }
        }
        const manifest = evidenceManifest(input.reviewId, input.epoch, {
          ...result,
          restarted,
        });
        const version = input.recordVersion ?? 1;
        const manifestRecord = version === 2
          ? EvidenceManifestV2Schema.parse({ recordVersion: 2, ...manifest })
          : manifest;
        handles.push(
          await writer.writeResource(
            version === 2 ? "evidenceManifestV2" : "evidenceManifest",
            instanceName(
              version === 2 ? "evidenceManifestV2" : "evidenceManifest",
              input.reviewId,
              input.epoch,
            ),
            manifestRecord,
          ),
        );
        return {
          handles,
          revision: result.discovery.publishedRevision,
          counts: result.counts,
          restarted,
        };
      } catch (error) {
        if (
          !(error instanceof QueryBoundaryError) ||
          error.code !== "revision_moved" || attempt !== 0
        ) throw error;
        restarted = true;
        await Deno.remove(root, { recursive: true }).catch(() => {});
        await Deno.mkdir(root, { recursive: true });
      }
    }
    throw new Error("collection did not complete");
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
}
