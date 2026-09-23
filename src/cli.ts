#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMigrateMcpServer } from "./mcp/server.js";

const argument = process.argv[2];
if (argument === "--version" || argument === "-v") {
  process.stdout.write("migrate-mcp 0.0.1\n");
} else if (argument === "--help" || argument === "-h") {
  process.stdout.write("migrate-mcp 0.0.1\n\nRun without arguments to serve MCP over stdio.\n");
} else {
  serveStdio(() => createMigrateMcpServer(), {
    onerror(error) {
      process.stderr.write(`migrate-mcp: ${error.message}\n`);
    },
  });
}
