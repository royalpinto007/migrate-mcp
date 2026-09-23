import type { FrameworkId, ParsedOperation, RollbackGuidance } from "../domain/types.js";

export function buildRollbackGuidance(
  framework: FrameworkId,
  up: ParsedOperation[],
  down: ParsedOperation[],
): RollbackGuidance {
  const destructive = up.some((operation) =>
    ["drop-table", "drop-column", "truncate"].includes(operation.kind),
  );
  return {
    framework,
    reversible: down.length > 0 && !destructive ? true : destructive ? false : "unknown",
    summary:
      down.length > 0
        ? "A rollback path exists, but review it against retained data."
        : "No verified rollback operations were found.",
    steps: [
      "Take a verified backup or snapshot.",
      "Review the down migration without running it.",
      "Test forward, rollback, and forward again in an isolated database.",
    ],
    caveats: destructive ? ["Removed data cannot be recreated by schema rollback alone."] : [],
  };
}
