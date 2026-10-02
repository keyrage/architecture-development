import type { SpecialistId } from "./schemas.ts";

/** Execute selected specialist work concurrently when the host supports it. */
export async function executeSelectedSpecialists<T>(
  selected: readonly SpecialistId[],
  run: (specialist: SpecialistId) => Promise<T>,
  supportsParallel: boolean,
): Promise<T[]> {
  if (supportsParallel) return Promise.all(selected.map(run));
  const results: T[] = [];
  for (const specialist of selected) results.push(await run(specialist));
  return results;
}
