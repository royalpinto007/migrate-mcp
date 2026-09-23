import { describe, expect, it } from "vitest";
import { explainOperations } from "../../src/analysis/explain.js";
import { reviewOperations } from "../../src/analysis/risks.js";
import { parseSourceOperations } from "../../src/analysis/source.js";
import { parseSqlOperations } from "../../src/analysis/sql.js";

describe("migration analysis", () => {
  it("ignores destructive words in comments and strings", () => {
    expect(
      parseSqlOperations("-- DROP TABLE users\nSELECT 'DROP COLUMN x';", "postgres", "x.sql"),
    ).toEqual([]);
  });

  it("finds destructive and availability-sensitive SQL with locations", () => {
    const operations = parseSqlOperations(
      "ALTER TABLE users ADD COLUMN email text NOT NULL;\nDROP TABLE sessions;",
      "postgres",
      "001.sql",
    );
    const findings = reviewOperations(operations);
    expect(
      findings.some((finding) => finding.ruleId === "availability/not-null-without-default"),
    ).toBe(true);
    const drop = findings.find((finding) => finding.ruleId === "destructive/drop-table");
    expect(drop).toMatchObject({ severity: "critical" });
    expect(drop?.location?.line).toBe(2);
  });

  it("recognizes framework migration calls and explains them", () => {
    const operations = parseSourceOperations(
      'op.drop_column("users", "legacy")',
      "alembic",
      "migration.py",
    );
    expect(operations[0]).toMatchObject({ kind: "drop-column", object: "users.legacy" });
    expect(explainOperations(operations).summary).toContain("removes column legacy from users");
  });
});
