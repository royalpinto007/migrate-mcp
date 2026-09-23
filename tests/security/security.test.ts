import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessRunner } from "../../src/process/runner.js";
import { resolveInsideRepository, resolveRepository } from "../../src/security/repository.js";
import { redactSensitive } from "../../src/security/redact.js";

describe("security boundaries", () => {
  it("rejects paths and symlinks outside the repository", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "migrate-mcp-repo-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "migrate-mcp-out-"));
    await symlink(outside, path.join(repo, "migrations"), "dir");
    const context = await resolveRepository(repo);
    await expect(resolveInsideRepository(context, "../escape")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_REPOSITORY",
    });
    await expect(resolveInsideRepository(context, "migrations")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_REPOSITORY",
    });
  });

  it("redacts URL credentials and sensitive query values", () => {
    expect(redactSensitive("postgres://roy:p%40ss@db/app?token=abc123&ssl=true")).toBe(
      "postgres://roy:[REDACTED]@db/app?token=[REDACTED]&ssl=true",
    );
  });

  it("times out and caps process output", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "migrate-mcp-run-"));
    const script = path.join(repo, "fake.mjs");
    await writeFile(script, 'process.stdout.write("x".repeat(100)); setTimeout(()=>{}, 5000);');
    const runner = new ProcessRunner({ maxOutputBytes: 32, timeoutMs: 25 });
    await expect(
      runner.run({ executable: process.execPath, args: [script], cwd: repo }),
    ).rejects.toMatchObject({
      code: "PROCESS_TIMEOUT",
    });
  });

  it("allows a missing child path for generation", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "migrate-mcp-new-"));
    await mkdir(path.join(repo, "migrations"));
    const context = await resolveRepository(repo);
    expect(
      await resolveInsideRepository(context, "migrations/new.sql", { allowMissing: true }),
    ).toBe(path.join(repo, "migrations/new.sql"));
  });
});
