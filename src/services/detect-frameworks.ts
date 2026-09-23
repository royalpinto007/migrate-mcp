import { createDefaultRegistry } from "../adapters/registry.js";
import type { DetectedFramework } from "../domain/types.js";
import { resolveRepository } from "../security/repository.js";

export async function detectMigrationFrameworks(repository: string): Promise<DetectedFramework[]> {
  return await createDefaultRegistry().detectAll(await resolveRepository(repository));
}
