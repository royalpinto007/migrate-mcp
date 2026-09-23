import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { MigrateMcpError } from "../domain/errors.js";

export interface RepositoryContext {
  root: string;
}

export async function resolveRepository(root: string): Promise<RepositoryContext> {
  const resolved = await realpath(path.resolve(root));
  if (!(await stat(resolved)).isDirectory()) {
    throw new MigrateMcpError("INVALID_INPUT", "Repository path must be a directory.");
  }
  return { root: resolved };
}

export async function resolveInsideRepository(
  repository: RepositoryContext,
  candidate: string,
  options: { allowMissing?: boolean } = {},
): Promise<string> {
  const lexical = path.resolve(repository.root, candidate);
  assertContained(repository.root, lexical);
  let resolved: string;
  try {
    resolved = await realpath(lexical);
  } catch (error) {
    if (!options.allowMissing || !isMissing(error)) throw error;
    const parent = await realpath(path.dirname(lexical));
    assertContained(repository.root, parent);
    resolved = path.join(parent, path.basename(lexical));
  }
  assertContained(repository.root, resolved);
  return resolved;
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new MigrateMcpError("PATH_OUTSIDE_REPOSITORY", "Path resolves outside the repository.");
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
