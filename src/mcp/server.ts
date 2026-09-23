import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FRAMEWORK_IDS } from "../domain/types.js";
import {
  detectFrameworks,
  detectSchemaDrift,
  explainMigration,
  generateMigration,
  getRollbackGuidance,
  listMigrationStatus,
  reviewMigrations,
} from "../services/workflows.js";

const framework = z.enum(FRAMEWORK_IDS).optional();
const base = {
  repository: z
    .string()
    .min(1)
    .describe("Absolute or current-working-directory-relative repository path"),
  framework,
  options: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
};
const paths = z.array(z.string().min(1)).min(1);

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function safe<T extends object>(handler: () => Promise<T>) {
  return handler()
    .then(result)
    .catch((error: unknown) => ({
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : "Unknown migrate-mcp error",
        },
      ],
    }));
}

export function createMigrateMcpServer(): McpServer {
  const server = new McpServer({ name: "migrate-mcp", version: "0.0.1" });

  server.registerTool(
    "detect_migration_frameworks",
    {
      description:
        "Detect Alembic, golang-migrate, TypeORM, Sequelize, and Prisma from repository evidence.",
      inputSchema: z.object({ repository: base.repository }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    ({ repository }) => safe(async () => ({ frameworks: await detectFrameworks(repository) })),
  );

  server.registerTool(
    "list_migration_status",
    {
      description:
        "List migration inventory and database-backed status when framework configuration is available.",
      inputSchema: z.object(base),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => safe(() => listMigrationStatus(input)),
  );

  server.registerTool(
    "detect_schema_drift",
    {
      description:
        "Use verified framework-native commands to inspect schema drift and report unsupported dimensions honestly.",
      inputSchema: z.object(base),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => safe(() => detectSchemaDrift(input)),
  );

  server.registerTool(
    "review_migrations",
    {
      description:
        "Statically review migration files for destructive, availability, data, and rollback risks without executing them.",
      inputSchema: z.object({ ...base, paths }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => safe(() => reviewMigrations(input)),
  );

  server.registerTool(
    "generate_migration",
    {
      description:
        "Generate a migration through the detected framework. Requires explicit approval and blocks production-like targets.",
      inputSchema: z.object({ ...base, name: z.string(), approved: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (input) => safe(() => generateMigration(input)),
  );

  server.registerTool(
    "explain_migration",
    {
      description: "Explain migration operations in plain English without executing them.",
      inputSchema: z.object({ ...base, paths }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => safe(() => explainMigration(input)),
  );

  server.registerTool(
    "get_rollback_guidance",
    {
      description: "Provide rollback guidance and caveats. This tool never runs a rollback.",
      inputSchema: z.object({ ...base, paths }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => safe(() => getRollbackGuidance(input)),
  );

  return server;
}
