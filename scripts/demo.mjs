import { reviewMigrations } from "../dist/index.mjs";

const repository = new URL("../examples/risky-migration", import.meta.url).pathname;
const report = await reviewMigrations({
  repository,
  paths: ["migrations/20260923_cleanup.sql"],
});

console.log("migrate-mcp · review_migrations");
console.log("framework  alembic");
console.log("file       migrations/20260923_cleanup.sql\n");
for (const finding of report.findings) {
  const marker = finding.severity === "critical" ? "✖" : "⚠";
  console.log(`${marker} ${finding.ruleId}`);
  console.log(`  ${finding.message}`);
  if (finding.saferAlternative) console.log(`  safer: ${finding.saferAlternative}`);
  console.log();
}
console.log(`${report.findings.length} risks found · nothing executed`);
