import type { ParsedOperation } from "../domain/types.js";

export interface MigrationExplanation {
  summary: string;
  steps: string[];
}

export function explainOperations(operations: ParsedOperation[]): MigrationExplanation {
  const steps = operations.map((operation) => {
    const parts = (operation.object ?? "unknown object").split(".");
    const table = parts[0] ?? "unknown object";
    const child = parts[1];
    switch (operation.kind) {
      case "drop-column":
        return `It removes column ${child ?? "unknown"} from ${table}.`;
      case "drop-table":
        return `It removes table ${table} and its stored data.`;
      case "add-column":
        return `It adds column ${child ?? "unknown"} to ${table}.`;
      case "create-table":
        return `It creates table ${table}.`;
      case "update":
        return `It updates rows in ${table}.`;
      case "delete":
        return `It deletes rows from ${table}.`;
      default:
        return `It contains ${operation.kind.replaceAll("-", " ")} for ${operation.object ?? "an unknown object"}.`;
    }
  });
  return {
    summary:
      steps.length === 0 ? "No recognized migration operations were found." : steps.join(" "),
    steps,
  };
}
