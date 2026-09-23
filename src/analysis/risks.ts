import type { ParsedOperation, RiskFinding } from "../domain/types.js";

export function reviewOperations(operations: ParsedOperation[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const operation of operations) {
    const base = { location: operation.location, confidence: operation.confidence };
    if (["drop-table", "drop-column", "truncate"].includes(operation.kind)) {
      findings.push({
        ...base,
        ruleId: `destructive/${operation.kind}`,
        severity: "critical",
        category: "destructive",
        message: `${label(operation.kind)} ${operation.object ?? "an object"}.`,
        rationale: "The operation can permanently remove schema or data.",
        saferAlternative:
          "Back up affected data and use an expand-and-contract migration when possible.",
      });
    } else if (
      operation.kind === "add-column" &&
      operation.metadata?.hasNotNull === true &&
      operation.metadata.hasDefault !== true
    ) {
      findings.push({
        ...base,
        ruleId: "availability/not-null-without-default",
        severity: "warning",
        category: "availability",
        message: `Adds required column ${operation.object ?? "unknown"} without a default.`,
        rationale: "Existing rows may make this fail or force a blocking table rewrite.",
        saferAlternative: "Add it nullable, backfill in batches, then enforce NOT NULL.",
      });
    } else if (
      ["delete", "update"].includes(operation.kind) &&
      operation.metadata?.hasWhere !== true
    ) {
      findings.push({
        ...base,
        ruleId: `data/unbounded-${operation.kind}`,
        severity: "warning",
        category: "data",
        message: `${label(operation.kind)} affects every row in ${operation.object ?? "a table"}.`,
        rationale: "The statement has no WHERE clause.",
        saferAlternative: "Add a predicate and verify the affected row count.",
      });
    } else if (operation.kind === "dynamic-sql") {
      findings.push({
        ...base,
        ruleId: "unknown/dynamic-sql",
        severity: "warning",
        category: "unknown",
        message: "Dynamic SQL could not be inspected safely.",
        rationale: "The final statement is computed at runtime.",
        saferAlternative: "Review the generated SQL before running this migration.",
      });
    }
  }
  return findings;
}

function label(kind: string): string {
  return kind.replaceAll("-", " ").replace(/^./, (value) => value.toUpperCase());
}
