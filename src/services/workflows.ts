import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultRegistry, selectFramework } from "../adapters/registry.js";
import { parseSourceOperations } from "../analysis/source.js";
import { parseSqlOperations } from "../analysis/sql.js";
import { explainOperations } from "../analysis/explain.js";
import { reviewOperations } from "../analysis/risks.js";
import { MigrateMcpError } from "../domain/errors.js";
import type { FrameworkId, ParsedOperation } from "../domain/types.js";
import { diffSnapshots, snapshotFiles } from "../security/file-snapshot.js";
import { resolveInsideRepository, resolveRepository } from "../security/repository.js";
import { assertMigrationName, assertNonProductionTarget } from "../security/target-policy.js";

export interface WorkflowInput {
  repository: string;
  framework?: FrameworkId | undefined;
  environment?: Record<string, string> | undefined;
  options?: Record<string, string | boolean> | undefined;
}

async function prepare(input: WorkflowInput) {
  const repository = await resolveRepository(input.repository);
  const registry = createDefaultRegistry();
  const detected = await registry.detectAll(repository);
  const framework = selectFramework(detected, input.framework);
  return {
    repository,
    registry,
    framework,
    context: { repository, environment: input.environment, options: input.options },
  };
}

export async function detectFrameworks(repository: string) {
  const resolved = await resolveRepository(repository);
  return createDefaultRegistry().detectAll(resolved);
}

export async function listMigrationStatus(input: WorkflowInput) {
  const { registry, framework, context } = await prepare(input);
  return registry.adapter(framework.id).status(context);
}

export async function detectSchemaDrift(input: WorkflowInput) {
  const { registry, framework, context } = await prepare(input);
  return registry.adapter(framework.id).drift(context);
}

export async function generateMigration(
  input: WorkflowInput & { name: string; approved: boolean },
) {
  if (!input.approved)
    throw new MigrateMcpError(
      "APPROVAL_REQUIRED",
      "Migration generation requires explicit approval.",
    );
  assertMigrationName(input.name);
  assertNonProductionTarget([
    input.options?.environment?.toString(),
    input.options?.databaseUrl?.toString(),
    input.environment?.NODE_ENV,
  ]);
  const { repository, registry, framework, context } = await prepare(input);
  const before = await snapshotFiles(repository.root);
  const generated = await registry
    .adapter(framework.id)
    .generate({ ...context, name: input.name, approved: true });
  const after = await snapshotFiles(repository.root);
  const changed = diffSnapshots(before, after);
  if (changed.deleted.length > 0)
    throw new MigrateMcpError(
      "UNEXPECTED_FILE_WRITE",
      `Generator deleted unexpected files: ${changed.deleted.join(", ")}`,
    );
  if (generated.status === "verified" || generated.status === "partial") {
    generated.value.created = changed.created;
    generated.value.modified = changed.modified;
  }
  return generated;
}

export async function reviewMigrations(input: WorkflowInput & { paths: string[] }) {
  const { repository, framework } = await prepare(input);
  const operations: ParsedOperation[] = [];
  for (const relative of input.paths) {
    const absolute = await resolveInsideRepository(repository, relative);
    const source = await readFile(absolute, "utf8");
    if (path.extname(relative).toLowerCase() === ".sql")
      operations.push(...parseSqlOperations(source, "generic", relative));
    else
      operations.push(
        ...parseSourceOperations(
          source,
          framework.id === "alembic"
            ? "alembic"
            : framework.id === "sequelize"
              ? "sequelize"
              : "typeorm",
          relative,
        ),
      );
  }
  return {
    framework: framework.id,
    operations,
    findings: reviewOperations(operations),
    explanation: explainOperations(operations),
  };
}

export async function explainMigration(input: WorkflowInput & { paths: string[] }) {
  const result = await reviewMigrations(input);
  return {
    framework: result.framework,
    explanation: result.explanation,
    operations: result.operations,
  };
}

export async function getRollbackGuidance(input: WorkflowInput & { paths: string[] }) {
  const { registry, framework, context } = await prepare(input);
  return registry.adapter(framework.id).rollback(context, input.paths);
}
