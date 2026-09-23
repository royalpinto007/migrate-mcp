import { describe, expect, it } from "vitest";
import { createMigrateMcpServer } from "../../src/mcp/server.js";

describe("MCP server", () => {
  it("creates a server with only non-executing migration workflows", () => {
    const server = createMigrateMcpServer();
    expect(server).toBeDefined();
    expect(JSON.stringify(server)).not.toContain("apply_migration");
    expect(JSON.stringify(server)).not.toContain("run_rollback");
  });
});
