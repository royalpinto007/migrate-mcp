import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectFrameworks,
  generateMigration,
  reviewMigrations,
} from "../../src/services/workflows.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "migrate-mcp-workflow-"));
  await writeFile(path.join(root, "alembic.ini"), "[alembic]\nscript_location = migrations\n");
  await mkdir(path.join(root, "migrations"));
  return root;
}

describe("migration workflows", () => {
  it("detects a framework from its real repository evidence", async () => {
    const root = await repo();
    await expect(detectFrameworks(root)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "alembic" })]),
    );
  });

  it("requires explicit approval before generation", async () => {
    const root = await repo();
    await expect(
      generateMigration({ repository: root, name: "add_users", approved: false }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("blocks production-like generation targets", async () => {
    const root = await repo();
    await expect(
      generateMigration({
        repository: root,
        name: "add_users",
        approved: true,
        environment: { NODE_ENV: "production" },
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_TARGET" });
  });

  it("reviews destructive SQL without executing it", async () => {
    const root = await repo();
    await writeFile(path.join(root, "migrations", "001_drop.sql"), "DROP TABLE users;\n");
    const result = await reviewMigrations({ repository: root, paths: ["migrations/001_drop.sql"] });
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "destructive" })]),
    );
  });
});
