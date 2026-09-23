import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildRollbackGuidance } from "../analysis/rollback.js";
import { parseSourceOperations } from "../analysis/source.js";
import { parseSqlOperations } from "../analysis/sql.js";
import {
  failed,
  partial,
  success,
  unsupported,
  type CapabilityResult,
} from "../domain/capabilities.js";
import type {
  DetectedFramework,
  DriftReport,
  FrameworkCapabilities,
  FrameworkId,
  GenerationReport,
  MigrationRecord,
  MigrationStatusReport,
  ParsedOperation,
  RollbackGuidance,
} from "../domain/types.js";
import { ProcessRunner } from "../process/runner.js";
import type { CommandResult } from "../process/types.js";
import { alembicCommands } from "./alembic/commands.js";
import type { AdapterContext, GenerationInput, MigrationAdapter } from "./contracts.js";
import { golangMigrateCommands } from "./golang-migrate/commands.js";
import {
  prismaCommands,
  selectPrismaCommandFamily,
  type PrismaCommandFamily,
} from "./prisma/commands.js";
import { sequelizeCommands } from "./sequelize/commands.js";
import type { FrameworkCommand } from "./shared/commands.js";
import { exists, hasPackageDependency, listFiles, readPackage } from "./shared/file-evidence.js";
import { typeormCommands } from "./typeorm/commands.js";

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

export class OperationalAdapter implements MigrationAdapter {
  public readonly capabilities: FrameworkCapabilities;
  public constructor(
    public readonly id: FrameworkId,
    private readonly runner = new ProcessRunner(),
  ) {
    this.capabilities = CAPABILITIES[id];
  }

  public async detect(
    repository: AdapterContext["repository"],
  ): Promise<DetectedFramework | undefined> {
    const pkg = await readPackage(repository);
    const files = await listFiles(repository.root);
    const evidence: DetectedFramework["evidence"] = [];
    const add = (kind: "config" | "dependency" | "migration-file", detail: string, file?: string) =>
      evidence.push({ kind, detail, ...(file ? { path: file } : {}), confidence: "high" });
    if (this.id === "alembic" && (await exists(repository, "alembic.ini")))
      add("config", "alembic.ini", "alembic.ini");
    if (
      this.id === "golang-migrate" &&
      files.some((file) => /\d+_.+\.(?:up|down)\.sql$/.test(file))
    )
      add("migration-file", "paired golang-migrate SQL filename");
    if (this.id === "typeorm" && hasPackageDependency(pkg, "typeorm"))
      add("dependency", "typeorm dependency", "package.json");
    if (
      this.id === "sequelize" &&
      ((await exists(repository, ".sequelizerc")) || hasPackageDependency(pkg, "sequelize-cli"))
    )
      add("config", "Sequelize CLI configuration");
    if (
      this.id === "prisma" &&
      (files.some((file) => file.endsWith("schema.prisma")) || hasPackageDependency(pkg, "prisma"))
    )
      add("config", "Prisma schema or dependency");
    return evidence.length === 0
      ? undefined
      : { id: this.id, confidence: "high", evidence, capabilities: this.capabilities };
  }

  public async status(context: AdapterContext): Promise<CapabilityResult<MigrationStatusReport>> {
    const migrations = await this.inventory(context);
    const command = await this.statusCommand(context);
    const offline = {
      framework: this.id,
      migrations,
      summary: `${String(migrations.length)} migration(s) found on disk. Database status was not checked.`,
      evidence: ["filesystem inventory"],
      databaseBacked: false,
    };
    if (!command)
      return partial(
        offline,
        "Database-backed status requires framework configuration and credentials.",
        offline.evidence,
      );
    const result = await this.run(command, context);
    if (result.exitCode !== 0)
      return failed("Framework status command failed.", [result.stderr || result.stdout]);
    const parsed = applyStatus(this.id, migrations, result.stdout);
    return success(
      {
        framework: this.id,
        migrations: parsed,
        summary: summarizeStatus(parsed, result.stdout),
        evidence: [commandText(command)],
        databaseBacked: true,
      },
      [commandText(command)],
    );
  }

  public async drift(context: AdapterContext): Promise<CapabilityResult<DriftReport>> {
    if (this.id === "sequelize")
      return unsupported("Sequelize CLI has no verified source-model schema drift command.");
    if (this.id === "golang-migrate") {
      const report = baseDrift(this.id);
      report.codeToMigrations = {
        status: "unsupported",
        summary: "golang-migrate does not define a source-model schema.",
        evidence: [],
      };
      report.migrationsToDatabase = {
        status: "partial",
        summary: "Only migration version consistency can be checked.",
        evidence: ["migrate version"],
      };
      return partial(report, "Full schema drift is not available for golang-migrate.", [
        "migration filenames",
        "migrate version",
      ]);
    }
    const command = await this.driftCommand(context);
    if (!command) return unsupported("Required framework drift configuration is unavailable.");
    const result = await this.run(command, context);
    const drifted =
      result.exitCode !== 0 ||
      /(?:drift|changes?|not in sync|pending)/i.test(result.stdout + result.stderr);
    const report = baseDrift(this.id);
    report.codeToMigrations = {
      status: "verified",
      drifted,
      summary: drifted
        ? "Framework reported schema changes or drift."
        : "Framework reported no schema changes.",
      evidence: [commandText(command)],
    };
    report.migrationsToDatabase = {
      status: "partial",
      drifted,
      summary: "Result reflects the framework command and configured database.",
      evidence: [commandText(command)],
    };
    report.codeToDatabase = {
      status: "partial",
      drifted,
      summary: "Direct fidelity depends on framework configuration.",
      evidence: [commandText(command)],
    };
    return success(report, [commandText(command)]);
  }

  public async generate(input: GenerationInput): Promise<CapabilityResult<GenerationReport>> {
    const command = await this.generationCommand(input);
    if (!command)
      return unsupported(
        "Required generation configuration or supported framework version is unavailable.",
      );
    const result = await this.run(command, input);
    if (result.exitCode !== 0)
      return failed("Framework migration generation failed.", [result.stderr || result.stdout]);
    const skeleton = this.id === "sequelize" || this.id === "golang-migrate";
    return success(
      {
        framework: this.id,
        created: [],
        modified: [],
        findings: [],
        summary: skeleton
          ? "Generated an editable migration skeleton. No schema inference was claimed."
          : "Generated migration files through the framework CLI. Review them before running anything.",
        frameworkOutput: result.stdout || result.stderr,
      },
      [commandText(command)],
    );
  }

  public async rollback(
    context: AdapterContext,
    paths: string[],
  ): Promise<CapabilityResult<RollbackGuidance>> {
    const up: ParsedOperation[] = [];
    const down: ParsedOperation[] = [];
    for (const relative of paths) {
      const source = await readFile(path.join(context.repository.root, relative), "utf8");
      const direction =
        relative.includes(".down.") || /\b(?:down|downgrade)\s*\(/.test(source) ? "down" : "up";
      const parsed = relative.endsWith(".sql")
        ? parseSqlOperations(source, "generic", relative, direction)
        : parseSourceOperations(
            source,
            this.id === "alembic" ? "alembic" : this.id === "sequelize" ? "sequelize" : "typeorm",
            relative,
            direction,
          );
      (direction === "down" ? down : up).push(...parsed);
    }
    return success(buildRollbackGuidance(this.id, up, down), paths);
  }

  private async inventory(context: AdapterContext): Promise<MigrationRecord[]> {
    const files = (await listFiles(context.repository.root)).filter((file) =>
      isMigrationFile(this.id, file),
    );
    if (this.id !== "golang-migrate")
      return files.map((file) => ({
        id: file,
        name: path.basename(file),
        framework: this.id,
        paths: [file],
        status: "unknown",
      }));
    const pairs = new Map<string, MigrationRecord>();
    for (const file of files) {
      const match = /(?:^|\/)(\d+)_([^/]+)\.(up|down)\.sql$/.exec(file);
      if (!match) continue;
      const id = match[1] ?? file;
      const record = pairs.get(id) ?? {
        id,
        name: match[2] ?? id,
        framework: this.id,
        paths: [],
        status: "unknown" as const,
      };
      record.paths.push(file);
      const hasUp = record.paths.some((item) => item.includes(".up."));
      const hasDown = record.paths.some((item) => item.includes(".down."));
      record.direction = hasUp && hasDown ? "both" : hasUp ? "up" : "down";
      pairs.set(id, record);
    }
    return [...pairs.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  private async run(command: FrameworkCommand, context: AdapterContext): Promise<CommandResult> {
    return await this.runner.run({
      ...command,
      cwd: context.repository.root,
      ...(context.environment ? { env: context.environment } : {}),
    });
  }

  private async statusCommand(context: AdapterContext): Promise<FrameworkCommand | undefined> {
    if (context.options?.offline === true) return undefined;
    if (this.id === "alembic") return alembicCommands.status();
    if (this.id === "golang-migrate") {
      const url = stringOption(context, "databaseUrl");
      return url
        ? golangMigrateCommands.status(stringOption(context, "migrationsDir") ?? "migrations", url)
        : undefined;
    }
    if (this.id === "typeorm") {
      const source = stringOption(context, "dataSource");
      return source ? typeormCommands.status(source) : undefined;
    }
    if (this.id === "sequelize") return sequelizeCommands.status();
    const family = await this.prismaFamily(context);
    return family ? prismaCommands(family).status() : undefined;
  }

  private async driftCommand(context: AdapterContext): Promise<FrameworkCommand | undefined> {
    if (this.id === "alembic") return alembicCommands.drift();
    if (this.id === "typeorm") {
      const source = stringOption(context, "dataSource");
      return source ? typeormCommands.drift(source) : undefined;
    }
    if (this.id === "prisma") {
      const family = await this.prismaFamily(context);
      return family ? prismaCommands(family).drift() : undefined;
    }
    return undefined;
  }

  private async generationCommand(input: GenerationInput): Promise<FrameworkCommand | undefined> {
    if (this.id === "alembic") return alembicCommands.generate(input.name);
    if (this.id === "golang-migrate")
      return golangMigrateCommands.generate(
        stringOption(input, "migrationsDir") ?? "migrations",
        input.name,
      );
    if (this.id === "typeorm") {
      const source = stringOption(input, "dataSource");
      return source
        ? typeormCommands.generate(
            source,
            stringOption(input, "target") ?? `migrations/${input.name}`,
          )
        : undefined;
    }
    if (this.id === "sequelize") return sequelizeCommands.generate(input.name);
    const family = await this.prismaFamily(input);
    return family ? prismaCommands(family).generate(input.name) : undefined;
  }

  private async prismaFamily(context: AdapterContext): Promise<PrismaCommandFamily | undefined> {
    const configured = stringOption(context, "prismaVersion");
    if (configured) return selectPrismaCommandFamily(configured);
    const result = await this.run(prismaCommands("v7").version(), context);
    const version = /prisma\s*:?\s*(\d+\.\d+\.\d+(?:-[\w.-]+)?)/i.exec(result.stdout)?.[1];
    return version ? selectPrismaCommandFamily(version) : undefined;
  }
}

export function createOperationalAdapters(runner?: ProcessRunner): MigrationAdapter[] {
  return (["alembic", "golang-migrate", "typeorm", "sequelize", "prisma"] as const).map(
    (id) => new OperationalAdapter(id, runner),
  );
}

function isMigrationFile(id: FrameworkId, file: string): boolean {
  if (id === "golang-migrate") return /\d+_.+\.(?:up|down)\.sql$/.test(file);
  if (id === "prisma") return /(?:^|\/)migrations\/[^/]+\/migration\.sql$/.test(file);
  if (id === "alembic") return /(?:versions|migrations)\/[^/]+\.py$/.test(file);
  return /(?:^|\/)migrations\/[^/]+\.(?:[cm]?[jt]s)$/.test(file);
}

function applyStatus(
  id: FrameworkId,
  migrations: MigrationRecord[],
  output: string,
): MigrationRecord[] {
  return migrations.map((migration) => {
    let status: MigrationRecord["status"] = "unknown";
    if (id === "typeorm")
      status = output.includes(`[X] ${migration.name}`)
        ? "applied"
        : output.includes(`[ ] ${migration.name}`)
          ? "pending"
          : "unknown";
    if (id === "sequelize")
      status = new RegExp(`\\bup\\s+${escapeRegex(migration.name)}`).test(output)
        ? "applied"
        : new RegExp(`\\bdown\\s+${escapeRegex(migration.name)}`).test(output)
          ? "pending"
          : "unknown";
    if (id === "prisma")
      status =
        output.includes(migration.name) && /pending/i.test(output)
          ? "pending"
          : /up to date|database schema is up to date/i.test(output)
            ? "applied"
            : "unknown";
    if (id === "golang-migrate") {
      const current = /\b(\d+)\b/.exec(output)?.[1];
      status = current && Number(migration.id) <= Number(current) ? "applied" : "pending";
    }
    if (id === "alembic" && /heads?\)/i.test(output)) status = "applied";
    return { ...migration, status };
  });
}

function summarizeStatus(migrations: MigrationRecord[], output: string): string {
  const pending = migrations.filter((item) => item.status === "pending").length;
  return pending > 0
    ? `${String(pending)} pending migration(s).`
    : /dirty/i.test(output)
      ? "Database migration state is dirty."
      : "No pending migrations were identified by the framework output.";
}

function baseDrift(framework: FrameworkId): DriftReport {
  const empty = {
    status: "unsupported" as const,
    summary: "Not checked.",
    evidence: [] as string[],
  };
  return {
    framework,
    codeToMigrations: { ...empty },
    migrationsToDatabase: { ...empty },
    codeToDatabase: { ...empty },
  };
}

function stringOption(context: AdapterContext, name: string): string | undefined {
  const value = context.options?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function commandText(command: FrameworkCommand): string {
  return [
    command.executable,
    ...command.args.map((argument) =>
      /:\/\/[^@]+@|password|token/i.test(argument) ? "[REDACTED]" : argument,
    ),
  ].join(" ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
