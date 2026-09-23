import type { FrameworkId, ParsedOperation } from "../domain/types.js";

const calls = [
  {
    kind: "drop-column",
    regex:
      /(?:op\.drop_column|queryRunner\.dropColumn|queryInterface\.removeColumn)\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g,
  },
  {
    kind: "drop-table",
    regex:
      /(?:op\.drop_table|queryRunner\.dropTable|queryInterface\.dropTable)\(\s*["']([^"']+)["']/g,
  },
  {
    kind: "create-table",
    regex:
      /(?:op\.create_table|queryRunner\.createTable|queryInterface\.createTable)\(\s*["']([^"']+)["']/g,
  },
  {
    kind: "add-column",
    regex:
      /(?:op\.add_column|queryRunner\.addColumn|queryInterface\.addColumn)\(\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/g,
  },
] as const;

export function parseSourceOperations(
  source: string,
  _framework: Extract<FrameworkId, "alembic" | "typeorm" | "sequelize">,
  file: string,
  direction: ParsedOperation["direction"] = "up",
): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  for (const call of calls) {
    call.regex.lastIndex = 0;
    for (let match = call.regex.exec(source); match; match = call.regex.exec(source)) {
      const before = source.slice(0, match.index);
      const segments = before.split("\n");
      const primary = match[1] ?? "unknown";
      operations.push({
        kind: call.kind,
        object: match[2] ? `${primary}.${match[2]}` : primary,
        direction,
        raw: match[0],
        location: { file, line: segments.length, column: (segments.at(-1)?.length ?? 0) + 1 },
        confidence: "high",
      });
    }
  }
  if (/\.(?:query|execute)\(\s*[^"'`]/.test(source)) {
    operations.push({
      kind: "dynamic-sql",
      direction,
      raw: "dynamic SQL expression",
      location: { file, line: 1, column: 1 },
      confidence: "low",
    });
  }
  return operations;
}
