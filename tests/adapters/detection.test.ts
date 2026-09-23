import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry, selectFramework } from "../../src/adapters/registry.js";
import { resolveRepository } from "../../src/security/repository.js";

async function repoWith(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "migrate-detect-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return await resolveRepository(root);
}

describe("framework detection", () => {
  it.each([
    ["alembic", { "alembic.ini": "[alembic]\nscript_location = migrations" }],
    ["golang-migrate", { "migrations/000001_init.up.sql": "CREATE TABLE users(id int);" }],
    ["typeorm", { "package.json": '{"dependencies":{"typeorm":"0.3.28"}}' }],
    ["sequelize", { ".sequelizerc": "module.exports = {}" }],
    ["prisma", { "prisma/schema.prisma": 'datasource db { provider = "postgresql" }' }],
  ] as const)("detects %s", async (expected, files) => {
    const detected = await createDefaultRegistry().detectAll(await repoWith(files));
    expect(detected.map((item) => item.id)).toContain(expected);
  });

  it("requires selection when more than one framework is present", async () => {
    const detected = await createDefaultRegistry().detectAll(
      await repoWith({
        "package.json": '{"dependencies":{"typeorm":"0.3.28","prisma":"7.0.0"}}',
        "prisma/schema.prisma": 'datasource db { provider = "postgresql" }',
      }),
    );
    expect(() => selectFramework(detected)).toThrow(
      expect.objectContaining({ code: "AMBIGUOUS_FRAMEWORK" }),
    );
  });
});
