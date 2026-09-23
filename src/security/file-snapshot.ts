import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listFiles } from "../adapters/shared/file-evidence.js";

export type FileSnapshot = Map<string, string>;

export async function snapshotFiles(root: string): Promise<FileSnapshot> {
  const result = new Map<string, string>();
  for (const relative of await listFiles(root)) {
    if (relative.startsWith(".git/") || relative.startsWith("node_modules/")) continue;
    const bytes = await readFile(path.join(root, relative));
    result.set(relative, createHash("sha256").update(bytes).digest("hex"));
  }
  return result;
}

export function diffSnapshots(
  before: FileSnapshot,
  after: FileSnapshot,
): { created: string[]; modified: string[]; deleted: string[] } {
  const created = [...after.keys()].filter((file) => !before.has(file));
  const modified = [...after]
    .filter(([file, hash]) => before.has(file) && before.get(file) !== hash)
    .map(([file]) => file);
  const deleted = [...before.keys()].filter((file) => !after.has(file));
  return { created: created.sort(), modified: modified.sort(), deleted: deleted.sort() };
}
