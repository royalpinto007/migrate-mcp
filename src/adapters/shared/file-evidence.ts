import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { RepositoryContext } from "../../security/repository.js";

export async function exists(repository: RepositoryContext, relative: string): Promise<boolean> {
  try {
    await access(path.join(repository.root, relative));
    return true;
  } catch {
    return false;
  }
}

export async function readPackage(repository: RepositoryContext): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path.join(repository.root, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

export function hasPackageDependency(pkg: Record<string, unknown>, name: string): boolean {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = pkg[field];
    if (section && typeof section === "object" && name in section) return true;
  }
  return false;
}

export async function listFiles(root: string, maxDepth = 5): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, depth + 1);
      else if (entry.isFile()) result.push(path.relative(root, absolute));
    }
  }
  await visit(root, 0);
  return result.sort();
}
