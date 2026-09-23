import { failed, unsupported } from "../domain/capabilities.js";
import { MigrateMcpError } from "../domain/errors.js";
import type { DetectedFramework, FrameworkCapabilities, FrameworkId } from "../domain/types.js";
import type { RepositoryContext } from "../security/repository.js";
import type { MigrationAdapter } from "./contracts.js";
import { exists, hasPackageDependency, listFiles, readPackage } from "./shared/file-evidence.js";

type Detector = Pick<MigrationAdapter, "id" | "capabilities" | "detect">;

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

const CAPABILITIES: Record<FrameworkId, FrameworkCapabilities> = {
  alembic: {
    inventory: true,
    databaseStatus: true,
    codeDrift: true,
    databaseDrift: true,
    generation: "automatic",
  },
  "golang-migrate": {
    inventory: true,
    databaseStatus: true,
    codeDrift: false,
    databaseDrift: false,
    generation: "skeleton",
  },
  typeorm: {
    inventory: true,
    databaseStatus: true,
    codeDrift: true,
    databaseDrift: true,
    generation: "automatic",
  },
  sequelize: {
    inventory: true,
    databaseStatus: true,
    codeDrift: false,
    databaseDrift: false,
    generation: "skeleton",
  },
  prisma: {
    inventory: true,
    databaseStatus: true,
    codeDrift: true,
    databaseDrift: true,
    generation: "automatic",
  },
};

function detector(id: FrameworkId): MigrationAdapter {
  const definition: Detector = {
    id,
    capabilities: CAPABILITIES[id],
    async detect(repository) {
      const pkg = await readPackage(repository);
      const files = await listFiles(repository.root);
      const evidence: DetectedFramework["evidence"] = [];
      const add = (
        kind: "config" | "dependency" | "migration-file",
        detail: string,
        file?: string,
      ) => evidence.push({ kind, detail, ...(file ? { path: file } : {}), confidence: "high" });
      if (id === "alembic" && (await exists(repository, "alembic.ini")))
        add("config", "alembic.ini", "alembic.ini");
      if (id === "golang-migrate" && files.some((file) => /\d+_.+\.(?:up|down)\.sql$/.test(file)))
        add("migration-file", "paired golang-migrate SQL filename");
      if (id === "typeorm" && hasPackageDependency(pkg, "typeorm"))
        add("dependency", "typeorm dependency", "package.json");
      if (
        id === "sequelize" &&
        ((await exists(repository, ".sequelizerc")) || hasPackageDependency(pkg, "sequelize-cli"))
      )
        add("config", "Sequelize CLI configuration");
      if (
        id === "prisma" &&
        (files.some((file) => file.endsWith("schema.prisma")) ||
          hasPackageDependency(pkg, "prisma"))
      )
        add("config", "Prisma schema or dependency");
      if (evidence.length === 0) return undefined;
      return { id, confidence: "high", evidence, capabilities: definition.capabilities };
    },
  };
  return {
    ...definition,
    status() {
      return Promise.resolve(unsupported(`${id} status adapter is not initialized.`));
    },
    drift() {
      return Promise.resolve(unsupported(`${id} drift adapter is not initialized.`));
    },
    generate() {
      return Promise.resolve(failed(`${id} generation adapter is not initialized.`));
    },
    rollback() {
      return Promise.resolve(unsupported(`${id} rollback adapter is not initialized.`));
    },
  };
}

export function createDefaultRegistry(): FrameworkRegistry {
  return new FrameworkRegistry([
    detector("alembic"),
    detector("golang-migrate"),
    detector("typeorm"),
    detector("sequelize"),
    detector("prisma"),
  ]);
}
