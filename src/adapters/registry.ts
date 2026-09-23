import { MigrateMcpError } from "../domain/errors.js";
import type { DetectedFramework, FrameworkId } from "../domain/types.js";
import { ProcessRunner } from "../process/runner.js";
import type { RepositoryContext } from "../security/repository.js";
import type { MigrationAdapter } from "./contracts.js";
import { createOperationalAdapters } from "./operational.js";

export class FrameworkRegistry {
  public constructor(public readonly adapters: MigrationAdapter[]) {}

  public async detectAll(repository: RepositoryContext): Promise<DetectedFramework[]> {
    const detected = await Promise.all(
      this.adapters.map(async (adapter) => await adapter.detect(repository)),
    );
    return detected.filter((value): value is DetectedFramework => value !== undefined);
  }

  public adapter(id: FrameworkId): MigrationAdapter {
    const adapter = this.adapters.find((candidate) => candidate.id === id);
    if (!adapter) throw new MigrateMcpError("FRAMEWORK_NOT_DETECTED", `No adapter for ${id}.`);
    return adapter;
  }
}

export function selectFramework(
  detected: DetectedFramework[],
  requested?: FrameworkId,
): DetectedFramework {
  if (requested) {
    const match = detected.find((item) => item.id === requested);
    if (!match)
      throw new MigrateMcpError("FRAMEWORK_NOT_DETECTED", `${requested} was not detected.`);
    return match;
  }
  if (detected.length === 0)
    throw new MigrateMcpError(
      "FRAMEWORK_NOT_DETECTED",
      "No supported migration framework was detected.",
    );
  if (detected.length > 1)
    throw new MigrateMcpError(
      "AMBIGUOUS_FRAMEWORK",
      "Multiple migration frameworks were detected. Select one explicitly.",
    );
  const only = detected[0];
  if (!only)
    throw new MigrateMcpError(
      "FRAMEWORK_NOT_DETECTED",
      "No supported migration framework was detected.",
    );
  return only;
}

export function createDefaultRegistry(runner = new ProcessRunner()): FrameworkRegistry {
  return new FrameworkRegistry(createOperationalAdapters(runner));
}
